import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION, get, openDb, run } from './db.ts';

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
