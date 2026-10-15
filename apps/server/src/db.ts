import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type DB = DatabaseSync;
export type Row = Record<string, any>;

const SCHEMA = `
create table if not exists users (
  id integer primary key autoincrement,
  username text not null unique collate nocase,
  password_hash text not null,
  created_at text not null
);
-- browser sessions and API tokens; only the SHA-256 of the secret is stored
create table if not exists sessions (
  token_hash text primary key,
  user_id integer not null references users(id) on delete cascade,
  kind text not null default 'session',
  name text not null default '',
  created_at text not null,
  expires_at text,
  last_used text
);
-- one kind of thing: every note can sit on the Home list (a checkbox), be filed under tags, be pinned, archived (= done for a list item) or binned
create table if not exists notes (
  id text primary key,
  user_id integer not null references users(id) on delete cascade,
  title text not null default '',
  text text not null default '',
  note_type text not null default 'plain-text',
  pinned integer not null default 0,
  archived integer not null default 0,
  trashed integer not null default 0,
  on_list integer not null default 0,
  due_date text,
  percent_done real not null default 0,
  position real not null default 0,
  created_at text not null,
  updated_at text not null
);
create index if not exists notes_user on notes(user_id, updated_at);
create table if not exists tags (
  id text primary key,
  user_id integer not null references users(id) on delete cascade,
  title text not null,
  emoji text not null default '',
  color text not null default '',
  created_at text not null,
  unique (user_id, title)
);
create table if not exists note_tags (
  note_id text not null references notes(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);
`;

/**
 * Schema versions, kept in SQLite's own `user_version`. SCHEMA above is always the newest shape and is what a new database gets.
 * To change the shape: edit SCHEMA to the new form AND append the statements that turn the previous form into it here. An existing database
 * then runs just the ones it has not had. A database from a newer version than this server is refused instead of being damaged.
 */
export type Migration = string | ((db: DatabaseSync) => void);
export const MIGRATIONS: Migration[] = [
  // 1 -> 2: every task becomes tied to a note, labels become tags
  (db) => {
    db.exec('alter table tasks add column note_id text references notes(id) on delete cascade');
    const ins = db.prepare("insert into notes (id, user_id, title, text, note_type, pinned, archived, trashed, created_at, updated_at) values (?,?,?,?, 'plain-text', 0, 0, 0, ?, ?)");
    const link = db.prepare('update tasks set note_id = ? where id = ?');
    for (const t of db.prepare('select id, user_id, title, description, created_at, updated_at from tasks').all() as Row[]) {
      const id = randomUUID();
      ins.run(id, t.user_id, t.title, t.description, t.created_at, t.updated_at);
      link.run(id, t.id);
    }
    const tagFor = db.prepare('select id from tags where user_id = ? and title = ?');
    const newTag = db.prepare('insert into tags (id, user_id, title, created_at) values (?,?,?,?)');
    const attach = db.prepare('insert or ignore into note_tags (note_id, tag_id) values (?,?)');
    for (const r of db.prepare('select t.note_id, l.user_id, l.title from task_labels tl join labels l on l.id = tl.label_id join tasks t on t.id = tl.task_id').all() as Row[]) {
      let tag = (tagFor.get(r.user_id, r.title) as Row | undefined)?.id as string | undefined;
      if (!tag) { tag = randomUUID(); newTag.run(tag, r.user_id, r.title, new Date().toISOString()); }
      attach.run(r.note_id, tag);
    }
    db.exec('drop table task_labels; drop table labels; alter table tasks drop column title; alter table tasks drop column description; create unique index tasks_note on tasks(note_id)');
  },
  // 2 -> 3: a tag can have an emoji and a colour
  "alter table tags add column emoji text not null default ''; alter table tags add column color text not null default ''",
  // 3 -> 4: one kind of thing. A task's few kept fields move onto its note; lists ("projects") become tags, done becomes archived, comments are
  // appended to the text; reminders, relations, repeats, priority, start/end dates are dropped (the owner did not use them)
  (db) => {
    db.exec(`alter table notes add column on_list integer not null default 0; alter table notes add column due_date text;
      alter table notes add column percent_done real not null default 0; alter table notes add column position real not null default 0`);
    const projects = new Map<number, Row>();
    for (const p of db.prepare('select * from projects').all() as Row[]) projects.set(p.id, p);
    const path = (id: number | null | undefined): string[] => { const p = id ? projects.get(id) : undefined; return p && !p.is_inbox ? [...path(p.parent_id), p.title.replace(/\./g, ' ')] : []; };
    const tagFor = db.prepare('select id from tags where user_id = ? and title = ?');
    const newTag = db.prepare('insert into tags (id, user_id, title, created_at) values (?,?,?,?)');
    const attach = db.prepare('insert or ignore into note_tags (note_id, tag_id) values (?,?)');
    const hasComments = !!db.prepare("select 1 x from sqlite_master where name = 'task_comments'").get();
    const comments = hasComments ? db.prepare('select comment, author, created_at from task_comments where task_id = ? order by id') : null;
    const upd = db.prepare('update notes set on_list = 1, due_date = ?, percent_done = ?, archived = ?, pinned = ?, text = ? where id = ?');
    const rows = db.prepare(`select t.*, n.text as n_text, n.archived as n_archived, n.pinned as n_pinned from tasks t join notes n on n.id = t.note_id
      order by t.done, t.due_date is null, t.due_date, t.position, t.id`).all() as Row[];
    const order: string[] = [];
    for (const t of rows) {
      let text = String(t.n_text);
      const cs = (comments?.all(t.id) ?? []) as Row[];
      if (cs.length) text = `${text.trimEnd()}\n\n--- Comments ---\n${cs.map((c) => `${c.author ? `${c.author}, ` : ''}${String(c.created_at).slice(0, 10)}: ${c.comment}`).join('\n')}\n`.trimStart();
      upd.run(t.due_date, t.percent_done, t.n_archived || t.done ? 1 : 0, t.n_pinned || t.is_favorite ? 1 : 0, text, t.note_id);
      const proj = path(t.project_id).join('.');
      if (proj) {
        let tag = (tagFor.get(t.user_id, proj) as Row | undefined)?.id as string | undefined;
        if (!tag) { tag = randomUUID(); newTag.run(tag, t.user_id, proj, new Date().toISOString()); }
        attach.run(t.note_id, tag);
      }
      order.push(t.note_id);
    }
    // hand-ordering starts from the order the lists had; plain notes follow, newest edit first
    const setPos = db.prepare('update notes set position = ? where id = ?');
    order.forEach((id, i) => setPos.run(i + 1, id));
    (db.prepare('select id from notes where on_list = 0 order by pinned desc, updated_at desc').all() as Row[]).forEach((r, i) => setPos.run(order.length + i + 1, r.id));
    db.exec('drop table if exists task_reminders; drop table if exists task_relations; drop table if exists task_comments; drop table tasks; drop table if exists projects');
  },
];
export const SCHEMA_VERSION = 1 + MIGRATIONS.length;

function migrate(db: DatabaseSync) {
  let have = Number((db.prepare('pragma user_version').get() as Row).user_version);
  // a database made before versions existed has its tables already: the shape of `tasks` says which version it is (a new one has no tables)
  if (have === 0 && db.prepare("select 1 x from sqlite_master where type = 'table' and name = 'tasks'").get())
    have = (db.prepare("select 1 x from pragma_table_info('tasks') where name = 'note_id'").get() ? (db.prepare("select 1 x from pragma_table_info('tags') where name = 'emoji'").get() ? 3 : 2) : 1);
  else if (have === 0 && db.prepare("select 1 x from pragma_table_info('notes') where name = 'on_list'").get()) have = SCHEMA_VERSION;
  if (have > SCHEMA_VERSION) throw new Error(`This database is from a newer TurboKeep (schema ${have}, this server knows ${SCHEMA_VERSION}). Update the server, or restore a backup.`);
  if (have === SCHEMA_VERSION) { db.exec(`pragma user_version = ${SCHEMA_VERSION}`); return; }
  db.exec('begin immediate');
  try {
    if (have === 0) db.exec(SCHEMA); // new database: always the newest shape
    else for (const m of MIGRATIONS.slice(have - 1)) typeof m === 'string' ? db.exec(m) : m(db);
    db.exec(`pragma user_version = ${SCHEMA_VERSION}`);
    db.exec('commit');
  } catch (e) { db.exec('rollback'); throw e; }
}

/** Opens (and creates) the database. ':memory:' is used by the tests. */
export function openDb(dataDir: string | ':memory:'): DB {
  let file = ':memory:';
  if (dataDir !== ':memory:') { mkdirSync(dataDir, { recursive: true }); file = join(dataDir, 'turbokeep.db'); }
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');
  migrate(db);
  return db;
}

/** Runs fn in a transaction (rolled back when it throws). Nested calls join the outer one. */
const depth = new WeakMap<DB, number>();
export function tx<T>(db: DB, fn: () => T): T {
  const d = depth.get(db) ?? 0;
  if (d > 0) return fn();
  db.exec('begin immediate');
  depth.set(db, 1);
  try { const r = fn(); db.exec('commit'); return r; }
  catch (e) { db.exec('rollback'); throw e; }
  finally { depth.set(db, 0); }
}

export const all = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
export const get = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
export const run = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).run(...p);
export const now = () => new Date().toISOString();
