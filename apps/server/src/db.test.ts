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
  it('migrates a version 1 database: every task gets a note, labels become tags, nothing is lost', () => {
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
        create table tasks (id integer primary key autoincrement, user_id integer not null references users(id) on delete cascade, project_id integer not null references projects(id) on delete cascade, title text not null, description text not null default '', done integer not null default 0, done_at text, due_date text, created_at text not null, updated_at text not null);
        create table task_labels (task_id integer not null references tasks(id) on delete cascade, label_id integer not null references labels(id) on delete cascade, primary key (task_id, label_id));
        insert into users values (1, 'luka', 'x', '2026-10-01T00:00:00Z');
        insert into projects values (1, 1, 'Inbox', 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
        insert into notes values ('11111111-1111-4111-8111-111111111111', 1, 'Existing note', 'keep me', 'plain-text', 0, 0, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
        insert into tags values ('t-home', 1, 'home', '2026-10-01T00:00:00Z');
        insert into labels values (1, 1, 'home', '', 'ff0000', 'c', 'u'), (2, 1, 'urgent', '', '', 'c', 'u');
        insert into tasks values (1, 1, 1, 'Pay rent', 'by Friday', 0, null, '2026-11-01T09:00:00.000Z', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z');
        insert into tasks values (2, 1, 1, 'Done thing', '', 1, '2026-10-04T00:00:00Z', null, '2026-10-02T00:00:00Z', '2026-10-04T00:00:00Z');
        insert into task_labels values (1, 1), (1, 2);
        pragma user_version = 1;`);
      old.close();

      const db = openDb(dir);
      expect(Number(get(db, 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION);
      const rows = all(db, 'select t.id, t.done, t.due_date, n.title, n.text, n.created_at, n.updated_at from tasks t join notes n on n.id = t.note_id order by t.id');
      expect(rows.map((r) => [r.id, r.title, r.text, r.done, r.due_date])).toEqual([[1, 'Pay rent', 'by Friday', 0, '2026-11-01T09:00:00.000Z'], [2, 'Done thing', '', 1, null]]);
      expect(rows[0]!.created_at).toBe('2026-10-02T00:00:00Z'); // dates carry over
      // the existing tag was reused, the other label became a tag
      expect(all(db, 'select g.title from note_tags nt join tags g on g.id = nt.tag_id join tasks t on t.note_id = nt.note_id where t.id = 1 order by g.title').map((r) => r.title)).toEqual(['home', 'urgent']);
      expect(get(db, 'select count(*) c from tags')!.c).toBe(2);
      expect(get(db, 'select count(*) c from notes')!.c).toBe(3); // the old note plus one per task
      expect(get(db, "select count(*) c from sqlite_master where name in ('labels', 'task_labels')")!.c).toBe(0);
      db.close();
      expect(Number(get(openDb(dir), 'pragma user_version')!.user_version)).toBe(SCHEMA_VERSION); // and a second start leaves it alone
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
