import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION, all, get, openDb, run } from './db.ts';

describe('database file', () => {
  it('is created at the current schema version, reopens untouched, and refuses a newer one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tk-'));
    try {
      const a = openDb(dir);
      run(a, "insert into users (username, password_hash, created_at) values ('x','y','z')");
      expect(Number(get(a, 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION);
      a.close();
      expect(get(openDb(dir), 'select count(*) c from users')!.c).toBe(1);
      const raw = new DatabaseSync(join(dir, 'turbokeep.db'));
      raw.exec(`pragma user_version = ${SCHEMA_VERSION + 1}`); raw.close();
      expect(() => openDb(dir)).toThrow(/newer TurboKeep/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('adopts a database made before versions existed (version 0, tables already there)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tk-'));
    try {
      const a = openDb(dir); a.exec('pragma user_version = 0'); a.close();
      expect(() => openDb(dir)).not.toThrow();
      expect(Number(get(openDb(dir), 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('migrates a version 1 database all the way: every task becomes a list item, labels become tags, nothing is lost', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tk-'));
    try {
      // the shape release 2026.10.x wrote: a task carries its own title and description, and has labels
      const old = new DatabaseSync(join(dir, 'turbokeep.db'));
      old.exec(`pragma foreign_keys = on;
        create table users (id integer primary key autoincrement, username text not null unique collate nocase, password_hash text not null, created_at text not null);
        create table notes (id text primary key, user_id integer not null references users(id) on delete cascade, title text not null default '', text text not null default '', note_type text not null default 'plain-text', pinned integer not null default 0, archived integer not null default 0, trashed integer not null default 0, created_at text not null, updated_at text not null);
        create table tags (id text primary key, user_id integer not null references users(id) on delete cascade, title text not null, created_at text not null, unique (user_id, title));
        create table note_tags (note_id text not null references notes(id) on delete cascade, tag_id text not null references tags(id) on delete cascade, primary key (note_id, tag_id));
        create table projects (id integer primary key autoincrement, user_id integer not null, title text not null, is_inbox integer not null default 0, created_at text not null, updated_at text not null);
        create table labels (id integer primary key autoincrement, user_id integer not null references users(id) on delete cascade, title text not null, description text not null default '', hex_color text not null default '', created_at text not null, updated_at text not null);
        create table tasks (id integer primary key autoincrement, user_id integer not null references users(id) on delete cascade, project_id integer not null references projects(id) on delete cascade, title text not null, description text not null default '', done integer not null default 0, done_at text, due_date text, start_date text, end_date text, priority integer not null default 0, percent_done real not null default 0, hex_color text not null default '', is_favorite integer not null default 0, position real not null default 0, repeat_after integer not null default 0, repeat_mode integer not null default 0, created_at text not null, updated_at text not null);
        create table task_labels (task_id integer not null references tasks(id) on delete cascade, label_id integer not null references labels(id) on delete cascade, primary key (task_id, label_id));
        insert into users values (1, 'luka', 'x', '2026-10-01T00:00:00Z');
        insert into projects values (1, 1, 'Inbox', 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
        insert into notes values ('11111111-1111-4111-8111-111111111111', 1, 'Existing note', 'keep me', 'plain-text', 0, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
        insert into tags values ('t-home', 1, 'home', '2026-10-01T00:00:00Z');
        insert into labels values (1, 1, 'home', '', 'ff0000', 'c', 'u'), (2, 1, 'urgent', '', '', 'c', 'u');
        insert into tasks (id, user_id, project_id, title, description, done, done_at, due_date, created_at, updated_at) values (1, 1, 1, 'Pay rent', 'by Friday', 0, null, '2026-11-01T09:00:00.000Z', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z');
        insert into tasks (id, user_id, project_id, title, description, done, done_at, due_date, created_at, updated_at) values (2, 1, 1, 'Done thing', '', 1, '2026-10-04T00:00:00Z', null, '2026-10-02T00:00:00Z', '2026-10-04T00:00:00Z');
        insert into task_labels values (1, 1), (1, 2);
        pragma user_version = 1;`);
      old.close();

      const db = openDb(dir);
      expect(Number(get(db, 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION);
      // every task is now an item on the list (v4): done is archived, the due date is on the note
      const rows = all(db, 'select title, text, archived, due_date, created_at, on_list from notes where on_list = 1 order by position');
      expect(rows.map((r) => [r.title, r.text, r.archived, r.due_date])).toEqual([['Pay rent', 'by Friday', 0, '2026-11-01T09:00:00.000Z'], ['Done thing', '', 1, null]]);
      expect(rows[0]!.created_at).toBe('2026-10-02T00:00:00Z'); // dates carry over
      // the existing tag was reused, the other label became a tag
      expect(all(db, "select g.title from note_tags nt join tags g on g.id = nt.tag_id join notes n on n.id = nt.note_id where n.title = 'Pay rent' order by g.title").map((r) => r.title)).toEqual(['home', 'urgent']);
      expect(get(db, 'select count(*) c from tags')!.c).toBe(2);
      expect(get(db, 'select count(*) c from notes')!.c).toBe(3); // the old note plus one per task
      expect(get(db, "select on_list from notes where title = 'Existing note'")!.on_list).toBe(0);
      expect(get(db, "select count(*) c from sqlite_master where name in ('labels', 'task_labels', 'tasks', 'projects')")!.c).toBe(0);
      db.close();
      expect(Number(get(openDb(dir), 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION); // and a second start leaves it alone
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('migrates a version 3 database: lists become tags, comments join the text, favourites are pinned, the order is kept, the old tables are gone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tk-'));
    try {
      const old = new DatabaseSync(join(dir, 'turbokeep.db'));
      old.exec(`pragma foreign_keys = on;
        create table users (id integer primary key autoincrement, username text not null unique collate nocase, password_hash text not null, created_at text not null);
        create table notes (id text primary key, user_id integer not null references users(id) on delete cascade, title text not null default '', text text not null default '', note_type text not null default 'plain-text', pinned integer not null default 0, archived integer not null default 0, trashed integer not null default 0, created_at text not null, updated_at text not null);
        create table tags (id text primary key, user_id integer not null references users(id) on delete cascade, title text not null, emoji text not null default '', color text not null default '', created_at text not null, unique (user_id, title));
        create table note_tags (note_id text not null references notes(id) on delete cascade, tag_id text not null references tags(id) on delete cascade, primary key (note_id, tag_id));
        create table projects (id integer primary key autoincrement, user_id integer not null, title text not null, parent_id integer, is_inbox integer not null default 0, created_at text not null, updated_at text not null);
        create table tasks (id integer primary key autoincrement, user_id integer not null references users(id) on delete cascade, note_id text not null unique references notes(id) on delete cascade, project_id integer not null, done integer not null default 0, done_at text, due_date text, start_date text, end_date text, priority integer not null default 0, percent_done real not null default 0, hex_color text not null default '', is_favorite integer not null default 0, position real not null default 0, repeat_after integer not null default 0, repeat_mode integer not null default 0, created_at text not null, updated_at text not null);
        create table task_reminders (id integer primary key autoincrement, task_id integer not null references tasks(id) on delete cascade, reminder text, relative_period integer not null default 0, relative_to text not null default '');
        create table task_relations (task_id integer not null references tasks(id) on delete cascade, other_task_id integer not null references tasks(id) on delete cascade, kind text not null, primary key (task_id, other_task_id, kind));
        create table task_comments (id integer primary key autoincrement, task_id integer not null references tasks(id) on delete cascade, comment text not null, author text not null default '', created_at text not null, updated_at text not null);
        insert into users values (1, 'luka', 'x', '2026-10-01T00:00:00Z');
        insert into projects values (1, 1, 'Inbox', null, 1, 'c', 'u'), (2, 1, 'Work', null, 0, 'c', 'u'), (3, 1, 'Reports', 2, 0, 'c', 'u');
        insert into notes values ('a', 1, 'Second in list', 'body', 'plain-text', 0, 0, 0, 'c1', 'u1'), ('b', 1, 'First in list', '', 'plain-text', 0, 0, 0, 'c2', 'u2'), ('c', 1, 'A note', 'keep', 'plain-text', 1, 0, 0, 'c3', 'u3'), ('d', 1, 'Done one', '', 'plain-text', 0, 0, 0, 'c4', 'u4');
        insert into tasks (id, user_id, note_id, project_id, done, due_date, priority, percent_done, is_favorite, position, created_at, updated_at) values
          (1, 1, 'a', 3, 0, null, 3, 0.5, 1, 20, 'c', 'u'), (2, 1, 'b', 1, 0, '2026-11-01T00:00:00Z', 0, 0, 0, 10, 'c', 'u'), (3, 1, 'd', 2, 1, null, 0, 0, 0, 5, 'c', 'u');
        insert into task_reminders (task_id, reminder) values (1, '2026-11-01T00:00:00Z');
        insert into task_relations values (1, 2, 'related'), (2, 1, 'related');
        insert into task_comments (task_id, comment, author, created_at, updated_at) values (1, 'remember this', 'luka', '2026-10-05T00:00:00Z', 'u');
        pragma user_version = 3;`);
      old.close();
      const db = openDb(dir);
      expect(Number(get(db, 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION);
      const n = (title: string) => get(db, 'select * from notes where title = ?', title)!;
      expect(n('Second in list')).toMatchObject({ on_list: 1, pinned: 1, archived: 0, percent_done: 0.5 }); // a favourite task is pinned
      expect(n('Second in list').text).toBe('body\n\n--- Comments ---\nluka, 2026-10-05: remember this\n');
      expect(n('Done one')).toMatchObject({ on_list: 1, archived: 1 }); // done is archived
      expect(n('A note')).toMatchObject({ on_list: 0, pinned: 1 });
      expect(n('First in list').due_date).toBe('2026-11-01T00:00:00Z');
      // the order of the old list (open tasks by due date, then position) is kept, plain notes come after it
      expect(all(db, 'select title from notes order by position').map((r) => r.title)).toEqual(['First in list', 'Second in list', 'Done one', 'A note']);
      // a list becomes a tag (nested lists with a dot); the Inbox does not
      expect(all(db, "select g.title from note_tags nt join tags g on g.id = nt.tag_id join notes n on n.id = nt.note_id where n.title = 'Second in list'").map((r) => r.title)).toEqual(['Work.Reports']);
      expect(all(db, "select count(*) c from note_tags nt join notes n on n.id = nt.note_id where n.title = 'First in list'")[0]!.c).toBe(0);
      expect(get(db, "select count(*) c from sqlite_master where name in ('tasks', 'projects', 'task_reminders', 'task_relations', 'task_comments')")!.c).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('VACUUM INTO makes a consistent copy while the database is open (the backup in the guide)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tk-'));
    try {
      const a = openDb(dir);
      run(a, "insert into users (username, password_hash, created_at) values ('x','y','z')");
      a.exec(`VACUUM INTO '${join(dir, 'backup.db').replace(/'/g, "''")}'`);
      const b = new DatabaseSync(join(dir, 'backup.db'));
      expect((b.prepare('select count(*) c from users').get() as any).c).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('imported pictures nothing uses', () => {
  it('are deleted after a grace period, the ones a tag shows are kept', async () => {
    const { createUser, addEmoji, listEmoji, pruneEmoji, styleTag, createNote } = await import('./store.ts');
    const { openDb } = await import('./db.ts');
    const db = openDb(':memory:');
    const uid = createUser(db, 'u', 'x');
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const used = addEmoji(db, uid, 'used', png), spare = addEmoji(db, uid, 'spare', png);
    createNote(db, uid, { title: 'a', tags: ['t'] });
    styleTag(db, uid, 't', { emoji: `:${used.id}:` });
    pruneEmoji(db, uid); // just made: both are kept for a while
    expect(listEmoji(db, uid).map((e) => e.id).sort()).toEqual([used.id, spare.id].sort());
    pruneEmoji(db, undefined, -1000);
    expect(listEmoji(db, uid).map((e) => e.id)).toEqual([used.id]);
    styleTag(db, uid, 't', { emoji: '🙂' }); // the tag lets go of it
    pruneEmoji(db, uid, -1000);
    expect(listEmoji(db, uid)).toEqual([]);
  });
});
