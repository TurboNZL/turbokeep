import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
create table if not exists notes (
  id text primary key,
  user_id integer not null references users(id) on delete cascade,
  title text not null default '',
  text text not null default '',
  note_type text not null default 'plain-text',
  pinned integer not null default 0,
  archived integer not null default 0,
  trashed integer not null default 0,
  created_at text not null,
  updated_at text not null
);
create index if not exists notes_user on notes(user_id, updated_at);
create table if not exists tags (
  id text primary key,
  user_id integer not null references users(id) on delete cascade,
  title text not null,
  created_at text not null,
  unique (user_id, title)
);
create table if not exists note_tags (
  note_id text not null references notes(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);
create table if not exists projects (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  title text not null,
  description text not null default '',
  hex_color text not null default '',
  parent_id integer references projects(id) on delete set null,
  is_archived integer not null default 0,
  is_favorite integer not null default 0,
  is_inbox integer not null default 0,
  position real not null default 0,
  created_at text not null,
  updated_at text not null
);
create table if not exists labels (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  title text not null,
  description text not null default '',
  hex_color text not null default '',
  created_at text not null,
  updated_at text not null
);
create table if not exists tasks (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  project_id integer not null references projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  done integer not null default 0,
  done_at text,
  due_date text,
  start_date text,
  end_date text,
  priority integer not null default 0,
  percent_done real not null default 0,
  hex_color text not null default '',
  is_favorite integer not null default 0,
  position real not null default 0,
  repeat_after integer not null default 0,
  repeat_mode integer not null default 0,
  created_at text not null,
  updated_at text not null
);
create index if not exists tasks_user_project on tasks(user_id, project_id);
create table if not exists task_labels (
  task_id integer not null references tasks(id) on delete cascade,
  label_id integer not null references labels(id) on delete cascade,
  primary key (task_id, label_id)
);
create table if not exists task_reminders (
  id integer primary key autoincrement,
  task_id integer not null references tasks(id) on delete cascade,
  reminder text,
  relative_period integer not null default 0,
  relative_to text not null default ''
);
create table if not exists task_relations (
  task_id integer not null references tasks(id) on delete cascade,
  other_task_id integer not null references tasks(id) on delete cascade,
  kind text not null,
  primary key (task_id, other_task_id, kind)
);
create table if not exists task_comments (
  id integer primary key autoincrement,
  task_id integer not null references tasks(id) on delete cascade,
  comment text not null,
  author text not null default '',
  created_at text not null,
  updated_at text not null
);
`;

/**
 * Schema versions, kept in SQLite's own `user_version`. SCHEMA above is always the newest shape and is what a new database gets.
 * To change the shape: edit SCHEMA to the new form AND append the statements that turn the previous form into it here. An existing database
 * then runs just the ones it has not had. A database from a newer version than this server is refused instead of being damaged.
 */
export const MIGRATIONS: string[] = [];
export const SCHEMA_VERSION = 1 + MIGRATIONS.length;

function migrate(db: DatabaseSync) {
  const have = Number((db.prepare('pragma user_version').get() as Row).user_version);
  if (have > SCHEMA_VERSION) throw new Error(`This database is from a newer TurboKeep (schema ${have}, this server knows ${SCHEMA_VERSION}). Update the server, or restore a backup.`);
  if (have === SCHEMA_VERSION) return;
  db.exec('begin immediate');
  try {
    if (have === 0) db.exec(SCHEMA); // new (or made before versions existed: every statement in SCHEMA is "if not exists")
    else for (const m of MIGRATIONS.slice(have - 1)) db.exec(m);
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
