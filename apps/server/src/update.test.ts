import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createApp } from './app.ts';
import { loadConfig, openHint } from './config.ts';
import { openDb } from './db.ts';
import { Updater } from './update.ts';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const fakeScript = (body: string) => { const d = mkdtempSync(join(tmpdir(), 'tk-upd-')); dirs.push(d); mkdirSync(join(d, 'scripts')); const f = join(d, 'scripts/update.sh'); writeFileSync(f, `#!/usr/bin/env bash\n${body}\n`); chmodSync(f, 0o755); return f; };
const until = async (f: () => boolean) => { for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 25)); };

describe('Updater', () => {
  it('runs the script in live mode, then asks for a restart', async () => {
    let exited = false;
    const u = new Updater({ script: fakeScript('echo "args: $1"; echo built'), restart: true, exit: () => { exited = true; }, exitDelayMs: 10 });
    expect(u.available).toBe(true);
    expect(u.start()).toBe(true);
    expect(u.start()).toBe(false); // one at a time
    await until(() => exited);
    expect(u.state()).toMatchObject({ status: 'done', restarting: true });
    expect(u.state().log).toContain('args: --live');
    expect(exited).toBe(true);
  });
  it('reports a failing script and does not restart', async () => {
    let exited = false;
    const u = new Updater({ script: fakeScript('echo nope; exit 3'), restart: true, exit: () => { exited = true; }, exitDelayMs: 10 });
    u.start();
    await until(() => u.state().status === 'error');
    expect(u.state().log.join('\n')).toMatch(/nope[\s\S]*code 3/);
    await new Promise((r) => setTimeout(r, 50));
    expect(exited).toBe(false);
  });
  it('is not available without a script', () => { expect(new Updater({}).available).toBe(false); expect(new Updater({ script: '/nonexistent/update.sh' }).available).toBe(false); });
});

describe('the update API', () => {
  const cfg = { ...loadConfig({}), webDir: '/nonexistent' };
  async function boot(updater?: Updater) {
    const app = createApp(openDb(':memory:'), { ...cfg, allowSignup: true }, { code: null }, updater);
    const reg = async (username: string) => { const r = await app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'correct horse battery' }) }); return r.headers.get('set-cookie')!.split(';')[0]!; };
    return { app, owner: await reg('owner'), other: await reg('other') };
  }
  it('is for the owner only; the second account gets 403 and no owner flag', async () => {
    const { app, owner, other } = await boot(new Updater({ script: fakeScript('echo hi') }));
    expect((await app.request('/api/admin/update', { headers: { cookie: other } })).status).toBe(403);
    expect((await app.request('/api/admin/update', { method: 'POST', headers: { cookie: other } })).status).toBe(403);
    expect(((await (await app.request('/api/auth/me', { headers: { cookie: other } })).json()) as any).user.owner).toBe(false);
    expect(((await (await app.request('/api/auth/me', { headers: { cookie: owner } })).json()) as any).user.owner).toBe(true);
    const info = (await (await app.request('/api/admin/update', { headers: { cookie: owner } })).json()) as any;
    expect(info).toMatchObject({ available: true, status: 'idle' });
  });
  it('starts for the owner (202), then refuses a second start (409); without an updater it is 404', async () => {
    const { app, owner } = await boot(new Updater({ script: fakeScript('sleep 1') }));
    expect((await app.request('/api/admin/update', { method: 'POST', headers: { cookie: owner } })).status).toBe(202);
    expect((await app.request('/api/admin/update', { method: 'POST', headers: { cookie: owner } })).status).toBe(409);
    const none = await boot();
    expect((await none.app.request('/api/admin/update', { method: 'POST', headers: { cookie: none.owner } })).status).toBe(404);
    expect(((await (await none.app.request('/api/admin/update', { headers: { cookie: none.owner } })).json()) as any).available).toBe(false);
  });
});

describe('start-up message and the install scripts', () => {
  it('names the port it really listens on', () => {
    expect(openHint({ host: '0.0.0.0', port: 47901 })).toBe("Open http://<this machine's address>:47901");
    expect(openHint({ host: '127.0.0.1', port: 47901 })).toBe('Open http://127.0.0.1:47901');
  });
  const root = new URL('../../../', import.meta.url).pathname;
  for (const f of ['scripts/install-pi.sh', 'scripts/update.sh']) {
    it(`${f} is valid bash`, () => { expect(spawnSync('bash', ['-n', root + f]).status).toBe(0); });
  }
  it('the installer defaults to the registered port and never to 8080', () => {
    const s = readFileSync(root + 'scripts/install-pi.sh', 'utf8');
    expect(s).toMatch(/PORT="47901"/); expect(s).not.toMatch(/8080/);
  });
  it('the dry run prints a plan and changes nothing', () => {
    const r = spawnSync('bash', [root + 'scripts/install-pi.sh', '--dry-run', '--yes', '--data-dir', '/var/lib/turbokeep-test'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/turbokeep\.service/); expect(r.stdout).toMatch(/47901/);
  });
});
