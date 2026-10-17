import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, unzipSync } from 'fflate';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { buildStandardNotesZip } from './formats/standardnotes.ts';

const cfg = { ...loadConfig({}), webDir: '/nonexistent', trustProxy: true };
let app: ReturnType<typeof createApp>;
let cookie = '';

async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (cookie) headers.cookie = cookie;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await app.request(path, { method, headers, body: payload });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!;
  return res;
}
const json = async (method: string, path: string, body?: unknown, extra?: Record<string, string>) => { const r = await call(method, path, body, extra); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const upload = (name: string, data: Uint8Array) => { const f = new FormData(); f.append('file', new File([data as BlobPart], name)); return f; };

beforeEach(async () => {
  cookie = '';
  app = createApp(openDb(':memory:'), cfg, { code: 'abc123' });
  await json('POST', '/api/auth/register', { username: 'luka', password: 'correct horse battery', setupCode: 'abc123' });
});

describe('accounts', () => {
  it('the first account needs the setup code from the log', async () => {
    const fresh = createApp(openDb(':memory:'), cfg, { code: 'abc123' });
    const r = await fresh.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'evil', password: 'longenoughpassword' }) });
    expect(r.status).toBe(403);
    expect((await (await fresh.request('/api/setup')).json() as any)).toMatchObject({ needsSetup: true, setupCodeRequired: true });
  });
  it('closes sign-up after the first account', async () => {
    cookie = '';
    expect((await json('POST', '/api/auth/register', { username: 'two', password: 'longenoughpassword' })).status).toBe(403);
  });
  it('rejects the API without a session, and a wrong password', async () => {
    cookie = '';
    expect((await json('GET', '/api/notes')).status).toBe(401);
    expect((await json('POST', '/api/auth/login', { username: 'luka', password: 'nope nope nope' })).status).toBe(401);
    expect((await json('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery' })).status).toBe(200);
    expect((await json('GET', '/api/auth/me')).body.user.username).toBe('luka');
  });
  it('locks out after repeated failures, per client address (CF-Connecting-IP)', async () => {
    cookie = '';
    const h = { 'cf-connecting-ip': '203.0.113.9' };
    for (let i = 0; i < 10; i++) await json('POST', '/api/auth/login', { username: 'luka', password: 'wrong wrong wrong' }, h);
    expect((await json('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery' }, h)).status).toBe(429);
    expect((await json('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery' }, { 'cf-connecting-ip': '203.0.113.10' })).status).toBe(200);
  });
  it('the Android app\'s page (http://localhost) signs in for a token, not a cookie, and may call the API with it across origins', async () => {
    cookie = '';
    const app_ = { origin: 'http://localhost' };
    // a preflight carries no token: answered before the sign-in check, for that origin only
    const pre = await call('OPTIONS', '/api/notes', undefined, { ...app_, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,cf-access-client-id' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('http://localhost');
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/Authorization/i);
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/CF-Access-Client-Id/i);
    const other = await call('OPTIONS', '/api/notes', undefined, { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    // `device` asks for a token: no cookie is set, and the token works as a bearer from that origin (a cross-site write needs no same-site check)
    const login = await call('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery', device: 'Android app' }, app_);
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toBeNull();
    expect(login.headers.get('access-control-allow-origin')).toBe('http://localhost');
    const { token, user } = await login.json() as any;
    expect(user.username).toBe('luka');
    expect(token).toMatch(/^tk_/);
    const bearer = { ...app_, authorization: `Bearer ${token}`, 'sec-fetch-site': 'cross-site' };
    expect((await json('POST', '/api/notes', { title: 'from the app' }, bearer)).status).toBe(201);
    expect((await json('GET', '/api/auth/me', undefined, bearer)).body.user.username).toBe('luka');
    // and it is listed as a token of its own, which can be revoked
    expect((await json('GET', '/api/tokens', undefined, bearer)).body.some((t: any) => t.name === 'Android app')).toBe(true);
  });
  it('sets a Secure cookie when the tunnel says https, and refuses cross-site writes', async () => {
    cookie = '';
    const r = await call('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery' }, { 'x-forwarded-proto': 'https' });
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly.*SameSite=Lax|SameSite=Lax.*HttpOnly/i);
    expect(r.headers.get('set-cookie')).toMatch(/Secure/);
    expect((await json('POST', '/api/notes', { title: 'x' }, { origin: 'https://evil.example', host: 'keep.example.com' })).status).toBe(403);
    // the tunnel's public name arrives as Host (or X-Forwarded-Host)
    expect((await json('POST', '/api/notes', { title: 'x' }, { origin: 'https://keep.example.com', host: 'keep.example.com' })).status).toBe(201);
    expect((await json('POST', '/api/notes', { title: 'y' }, { origin: 'https://keep.example.com', host: 'localhost:8080', 'x-forwarded-host': 'keep.example.com' })).status).toBe(201);
  });
  it('trusts Sec-Fetch-Site (a tunnel that rewrites Host cannot break it) and refuses cross-site', async () => {
    await json('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery' });
    const same = await json('POST', '/api/notes', { title: 'a' }, { 'sec-fetch-site': 'same-origin', origin: 'https://keep.example.com', host: 'internal:8080' });
    expect(same.status).toBe(201);
    expect((await json('POST', '/api/notes', { title: 'b' }, { 'sec-fetch-site': 'cross-site', origin: 'https://keep.example.com', host: 'keep.example.com' })).status).toBe(403);
  });
  it('ignores a forged first X-Forwarded-For entry when counting failed logins', async () => {
    cookie = '';
    for (let i = 0; i < 10; i++) await json('POST', '/api/auth/login', { username: 'luka', password: 'wrong wrong wrong' }, { 'x-forwarded-for': `10.0.0.${i}, 198.51.100.7` });
    expect((await json('POST', '/api/auth/login', { username: 'luka', password: 'correct horse battery' }, { 'x-forwarded-for': '10.9.9.9, 198.51.100.7' })).status).toBe(429);
  });
  it('API tokens work as Bearer and need no Origin match', async () => {
    const { body } = await json('POST', '/api/tokens', { name: 'script' });
    cookie = '';
    const r = await app.request('/api/notes', { method: 'POST', headers: { authorization: `Bearer ${body.token}`, 'content-type': 'application/json', origin: 'https://elsewhere.example' }, body: '{"title":"from a script"}' });
    expect(r.status).toBe(201);
  });
});

describe('notes', () => {
  it('creates, tags, searches, archives, trashes and deletes', async () => {
    const a = (await json('POST', '/api/notes', { title: 'Groceries', text: 'milk and eggs', tags: ['home', 'home.food'] })).body;
    await json('POST', '/api/notes', { title: 'Taxes', text: '100% sure' });
    expect(a.tags).toEqual(['home', 'home.food']);
    expect((await json('GET', '/api/notes?q=milk')).body).toHaveLength(1);
    expect((await json('GET', '/api/notes?q=' + encodeURIComponent('100%'))).body).toHaveLength(1);
    expect((await json('GET', '/api/notes?q=' + encodeURIComponent('%'))).body).toHaveLength(1); // literal percent, not a wildcard
    expect((await json('GET', '/api/notes?tag=home')).body).toHaveLength(1); // includes nested home.food
    await json('PATCH', `/api/notes/${a.id}`, { archived: true });
    expect((await json('GET', '/api/notes')).body).toHaveLength(1);
    expect((await json('GET', '/api/notes?view=archived')).body).toHaveLength(1);
    await json('PATCH', `/api/notes/${a.id}`, { archived: false, trashed: true });
    expect((await json('GET', '/api/notes?view=trashed')).body).toHaveLength(1);
    expect((await json('POST', '/api/notes/empty-trash')).body.deleted).toBe(1);
    expect((await json('GET', '/api/tags')).body).toEqual([]);
  });
  it('does not overwrite a note changed on another device', async () => {
    const n = (await json('POST', '/api/notes', { title: 't', text: 'one' })).body;
    await new Promise((r) => setTimeout(r, 5));
    const other = (await json('PATCH', `/api/notes/${n.id}`, { text: 'two', base: n.updatedAt })).body;
    const stale = await json('PATCH', `/api/notes/${n.id}`, { text: 'three', base: n.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.note.text).toBe('two');
    expect((await json('PATCH', `/api/notes/${n.id}`, { text: 'three', base: other.updatedAt })).status).toBe(200);
  });
  it('keeps one user\'s notes from another', async () => {
    const db = openDb(':memory:');
    const two = createApp(db, { ...cfg, allowSignup: true }, { code: null });
    const reg = async (u: string) => { const r = await two.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'longenoughpassword' }) }); return r.headers.get('set-cookie')!.split(';')[0]!; };
    const c1 = await reg('alice'), c2 = await reg('bobby');
    const made = await (await two.request('/api/notes', { method: 'POST', headers: { cookie: c1, 'content-type': 'application/json' }, body: '{"title":"mine"}' })).json() as any;
    expect((await two.request(`/api/notes/${made.id}`, { headers: { cookie: c2 } })).status).toBe(404);
    expect((await two.request(`/api/notes/${made.id}`, { method: 'DELETE', headers: { cookie: c2 } })).status).toBe(404);
  });
});

describe('one kind of thing: the list, finishing, ordering', () => {
  it('Home shows only what is on the list; finishing archives; the archive brings it back', async () => {
    const a = (await json('POST', '/api/notes', { title: 'Buy milk', onList: true })).body;
    await json('POST', '/api/notes', { title: 'Meeting notes', text: 'agenda', tags: ['work'] });
    expect(a).toMatchObject({ onList: true, archived: false, percentDone: 0, dueDate: null });
    expect((await json('GET', '/api/notes?list=1')).body.map((n: any) => n.title)).toEqual(['Buy milk']);
    expect((await json('GET', '/api/notes?list=0')).body.map((n: any) => n.title)).toEqual(['Meeting notes']);
    expect((await json('GET', '/api/notes?tag=work')).body.map((n: any) => n.title)).toEqual(['Meeting notes']);
    expect((await json('GET', '/api/notes?untagged=1')).body.map((n: any) => n.title)).toEqual(['Buy milk']);
    await json('PATCH', `/api/notes/${a.id}`, { archived: true }); // finish it
    expect((await json('GET', '/api/notes?list=1')).body).toEqual([]);
    expect((await json('GET', '/api/notes?view=archived')).body.map((n: any) => n.title)).toEqual(['Buy milk']);
    await json('PATCH', `/api/notes/${a.id}`, { archived: false });
    expect((await json('GET', '/api/notes?list=1')).body).toHaveLength(1);
  });
  it('"commit to memory": filing under tags and taking it off the list in one go', async () => {
    const a = (await json('POST', '/api/notes', { title: 'Idea', onList: true })).body;
    const r = (await json('PATCH', `/api/notes/${a.id}`, { onList: false, tags: ['ideas', 'work'] })).body;
    expect(r).toMatchObject({ onList: false, tags: ['ideas', 'work'] });
    expect((await json('GET', '/api/notes?list=1')).body).toEqual([]);
    expect((await json('GET', '/api/notes?tag=ideas')).body).toHaveLength(1);
  });
  it('due dates, progress, and the due filters', async () => {
    const soon = new Date(Date.now() + 3600_000).toISOString(), past = new Date(Date.now() - 3 * 86400_000).toISOString();
    const a = (await json('POST', '/api/notes', { title: 'a', onList: true, dueDate: soon, percentDone: 0.4 })).body;
    await json('POST', '/api/notes', { title: 'b', onList: true, dueDate: past });
    expect(a).toMatchObject({ dueDate: soon, percentDone: 0.4 });
    expect((await json('GET', '/api/notes?due=overdue')).body.map((n: any) => n.title)).toEqual(['b']);
    expect((await json('GET', '/api/notes?due=any')).body).toHaveLength(2);
    expect((await json('PATCH', `/api/notes/${a.id}`, { percentDone: 7, dueDate: null })).body).toMatchObject({ percentDone: 1, dueDate: null });
    expect((await json('PATCH', `/api/notes/${a.id}`, { dueDate: 'not a date' })).status).toBe(400);
  });
  it('new items go to the top; move puts one between two others and survives many moves', async () => {
    const ids: string[] = [];
    for (const t of ['one', 'two', 'three', 'four']) ids.push((await json('POST', '/api/notes', { title: t, onList: true })).body.id);
    const order = async () => (await json('GET', '/api/notes?list=1')).body.map((n: any) => n.title);
    expect(await order()).toEqual(['four', 'three', 'two', 'one']);
    await json('POST', `/api/notes/${ids[0]}/move`, { above: null, below: ids[3] }); // "one" to the top
    expect(await order()).toEqual(['one', 'four', 'three', 'two']);
    await json('POST', `/api/notes/${ids[1]}/move`, { above: ids[3], below: ids[2] }); // "two" between four and three
    expect(await order()).toEqual(['one', 'four', 'two', 'three']);
    await json('POST', `/api/notes/${ids[3]}/move`, { above: ids[2], below: null }); // "four" to the end
    expect(await order()).toEqual(['one', 'two', 'three', 'four']);
    // squeeze: always between the same two, the gap halves each time until the server has to renumber
    for (let i = 0; i < 60; i++) await json('POST', `/api/notes/${ids[1]}/move`, { above: ids[0], below: ids[2] });
    expect(await order()).toEqual(['one', 'two', 'three', 'four']);
    expect((await json('POST', `/api/notes/${ids[0]}/move`, {})).status).toBe(200);
  });
  it('pinning, finishing and moving do not stop an open editor from saving its text; only editing the text moves updatedAt', async () => {
    const n = (await json('POST', '/api/notes', { title: 't', text: 'one', onList: true })).body;
    await new Promise((r) => setTimeout(r, 5));
    const pinned = (await json('PATCH', `/api/notes/${n.id}`, { pinned: true, archived: false })).body;
    expect(pinned.updatedAt).toBe(n.updatedAt);
    await json('POST', `/api/notes/${n.id}/move`, {});
    expect((await json('PATCH', `/api/notes/${n.id}`, { text: 'two', base: n.updatedAt })).status).toBe(200);
  });
  it('the old task, project and relation routes are gone', async () => {
    expect((await json('GET', '/api/tasks')).status).toBe(404);
    expect((await json('GET', '/api/projects')).status).toBe(404);
  });
});

describe('import and export through HTTP', () => {
  it('Standard Notes: export, wipe, import = same notes; second import is a no-op', async () => {
    await json('POST', '/api/notes', { title: 'One', text: 'a', tags: ['x'], pinned: true });
    await json('POST', '/api/notes', { title: 'Two', text: 'b', archived: true });
    const zip = new Uint8Array(await (await call('GET', '/api/export/standardnotes')).arrayBuffer());
    expect(Object.keys(unzipSync(zip)).some((k) => k.startsWith('Items/Note/One-'))).toBe(true);
    const all = (await json('GET', '/api/notes?view=all')).body;
    for (const n of all) await json('DELETE', `/api/notes/${n.id}`);
    const dry = (await json('POST', '/api/import/standardnotes?dry=1', upload('b.zip', zip))).body;
    expect(dry).toMatchObject({ notes: 2, dry: true });
    expect((await json('GET', '/api/notes?view=all')).body).toHaveLength(0);
    expect((await json('POST', '/api/import/standardnotes', upload('b.zip', zip))).body).toMatchObject({ notes: 2, skipped: 0, tags: 1 });
    const back = (await json('GET', '/api/notes?view=all')).body;
    expect(back.map((n: any) => [n.title, n.pinned, n.archived, n.tags]).sort()).toEqual([['One', true, false, ['x']], ['Two', false, true, []]]);
    expect((await json('POST', '/api/import/standardnotes', upload('b.zip', zip))).body).toMatchObject({ notes: 0, skipped: 2 });
  });
  it('Standard Notes: plain text files, several at once; bad input is a 400, not a 500', async () => {
    const f = new FormData();
    f.append('file', new File(['hello'], 'Hello.txt'));
    f.append('file', new File(['# md'], 'Doc.md'));
    expect((await json('POST', '/api/import/standardnotes', f)).body.notes).toBe(2);
    const bad = await json('POST', '/api/import/standardnotes', upload('x.zip', strToU8('PK\x03\x04garbage')));
    expect(bad.status).toBe(400);
    expect((await json('POST', '/api/import/vikunja', upload('x.json', strToU8('not json')))).status).toBe(400);
  });
  const second = async () => {
    const app2 = createApp(openDb(':memory:'), cfg, { code: null });
    const reg = await app2.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'second', password: 'longenoughpassword' }) });
    const ck = reg.headers.get('set-cookie')!.split(';')[0]!;
    return { get: async (p: string) => (await (await app2.request(p, { headers: { cookie: ck } })).json()) as any, post: (p: string, d: FormData) => app2.request(p, { method: 'POST', headers: { cookie: ck }, body: d }) };
  };
  it('Vikunja: the list goes out as one project, tags as coloured labels; importing it elsewhere keeps what TurboKeep keeps', async () => {
    await json('POST', '/api/notes', { title: 'Write report', text: 'draft', onList: true, tags: ['urgent'], pinned: true, dueDate: '2031-03-04T05:06:07Z', percentDone: 0.25 });
    await json('POST', '/api/notes', { title: 'Collect data', onList: true, archived: true });
    await json('POST', '/api/notes', { title: 'Just a note', text: 'not a task' });
    await json('PATCH', '/api/tags', { title: 'urgent', color: 'ff0000' });
    const exp = await call('GET', '/api/export/vikunja');
    expect(exp.headers.get('x-not-exported')).toBe('1');
    const zip = new Uint8Array(await exp.arrayBuffer());
    const data = JSON.parse(new TextDecoder().decode(unzipSync(zip)['data.json']));
    expect(data).toHaveLength(1);
    expect(data[0].tasks.map((t: any) => [t.title, t.done])).toEqual([['Write report', false], ['Collect data', true]]);
    expect(data[0].tasks[0].labels[0]).toMatchObject({ title: 'urgent', hex_color: 'ff0000' });

    const two = await second();
    const f = new FormData(); f.append('file', new File([zip as BlobPart], 'v.zip'));
    const report = await (await two.post('/api/import/vikunja', f)).json() as any;
    expect(report).toMatchObject({ notes: 2, tags: 2 }); // the label and the project name
    const notes = await two.get('/api/notes?list=1&view=all');
    const t = notes.find((x: any) => x.title === 'Write report'), u = notes.find((x: any) => x.title === 'Collect data');
    expect(t).toMatchObject({ onList: true, pinned: true, dueDate: '2031-03-04T05:06:07.000Z', percentDone: 0.25, archived: false, tags: ['TurboKeep', 'urgent'] });
    expect(u.archived).toBe(true);
  });
  it('export of an empty account is still a valid file', async () => {
    const zip = new Uint8Array(await (await call('GET', '/api/export/vikunja')).arrayBuffer());
    expect(JSON.parse(new TextDecoder().decode(unzipSync(zip)['data.json']))[0]).toMatchObject({ title: 'TurboKeep', tasks: [] });
  });
});

describe('a genuine Vikunja export', () => {
  // made by a real Vikunja 0.24.6 (Settings > Export): 2 inboxes, a project with a parent task, two subtasks that follow each other
  it('imports every task as an item on the list; the project becomes a tag, the inbox does not, relations are dropped with a warning', async () => {
    const { readFileSync } = await import('node:fs');
    const zip = new Uint8Array(readFileSync(new URL('../test/fixtures/vikunja-0.24.6-export.zip', import.meta.url)));
    const r = (await json('POST', '/api/import/vikunja', upload('export.zip', zip))).body;
    expect(r).toMatchObject({ notes: 4 });
    expect(r.warnings.join(' ')).toMatch(/related tasks/);
    const notes = (await json('GET', '/api/notes?list=1')).body;
    expect(notes.map((t: any) => t.title).sort()).toEqual(['Child 1', 'Child 2', 'Elsewhere', 'Parent']);
    expect(notes.every((n: any) => n.onList)).toBe(true);
    expect(new Set(notes.flatMap((n: any) => n.tags))).toEqual(new Set(['Work']));
  });
});

describe('TurboKeep backup', () => {
  async function seed() {
    const note = (await json('POST', '/api/notes', { title: 'Meeting notes', text: 'agenda', tags: ['work'], pinned: true, noteType: 'markdown' })).body;
    const gone = (await json('POST', '/api/notes', { title: 'Old', text: 'x', archived: true })).body;
    const a = (await json('POST', '/api/notes', { title: 'Write report', text: 'draft first', onList: true, tags: ['work', 'urgent'], dueDate: '2031-03-04T05:06:07Z', percentDone: 0.5 })).body;
    const trashed = (await json('POST', '/api/notes', { title: 'In the trash', trashed: true })).body;
    return { note, gone, a, trashed };
  }
  const exportZip = async () => new Uint8Array(await (await call('GET', '/api/export/turbokeep')).arrayBuffer());

  it('exports one file with the format and version, everything in it, the trash and archive included', async () => {
    await seed();
    const j = JSON.parse(new TextDecoder().decode(unzipSync(await exportZip())['turbokeep.json']));
    expect(j).toMatchObject({ format: 'turbokeep', version: 2 });
    expect(j.notes).toHaveLength(4);
    expect(j.notes.find((n: any) => n.title === 'Write report')).toMatchObject({ onList: true, dueDate: '2031-03-04T05:06:07.000Z', percentDone: 0.5, tags: ['work', 'urgent'] }); // in the order they were given
    expect(j.projects).toBeUndefined();
  });
  it('into another account: the same notes, the list, dates, progress, tags and the order', async () => {
    const { a } = await seed();
    const zip = await exportZip();
    const two = await second2();
    const f = new FormData(); f.append('file', new File([zip as BlobPart], 'b.zip'));
    const dry = await (await two.post('/api/import/turbokeep?dry=1', f)).json() as any;
    expect(dry).toMatchObject({ notes: 4, dry: true });
    expect(await two.get('/api/notes?view=all')).toHaveLength(0);
    await two.post('/api/import/turbokeep', f);
    const all = await two.get('/api/notes?view=all');
    expect(all.map((n: any) => n.title).sort()).toEqual(['In the trash', 'Meeting notes', 'Old', 'Write report']);
    expect(all.find((n: any) => n.id === a.id)).toMatchObject({ onList: true, percentDone: 0.5, position: a.position });
  });
  it('importing it again changes nothing, and after deleting everything it restores everything', async () => {
    await seed();
    const zip = await exportZip();
    const r = (await json('POST', '/api/import/turbokeep', upload('b.zip', zip))).body;
    expect(r).toMatchObject({ notes: 0, skipped: 4 });
    for (const n of (await json('GET', '/api/notes?view=all')).body) await json('DELETE', `/api/notes/${n.id}`);
    expect((await json('POST', '/api/import/turbokeep', upload('b.zip', zip))).body).toMatchObject({ notes: 4 });
  });
  it('still reads a version 1 backup: tasks go on the list, done is archived, the project is a tag, comments join the text', async () => {
    const id = '5b3f2c1e-9a4d-4d0e-8f6b-2a1c3d4e5f60', id2 = '6b3f2c1e-9a4d-4d0e-8f6b-2a1c3d4e5f60';
    const v1 = { format: 'turbokeep', version: 1, projects: [{ id: 1, title: 'Inbox', isInbox: true }, { id: 2, title: 'Work', parentId: null }, { id: 3, title: 'Sub', parentId: 2 }], relations: [{ noteId: id, otherNoteId: id2, kind: 'subtask' }],
      notes: [{ id, title: 'Task', text: 'body', tags: ['t'], task: { projectId: 3, done: true, dueDate: '2031-01-01T00:00:00Z', percentDone: 0.5, isFavorite: true, priority: 4, reminders: [{ reminder: '2031-01-01T00:00:00Z' }], comments: [{ comment: 'hello', author: 'me', createdAt: '2030-01-02T00:00:00Z' }] } },
        { id: id2, title: 'Plain', text: '', task: null }] };
    const r = (await json('POST', '/api/import/turbokeep', upload('b.json', strToU8(JSON.stringify(v1))))).body;
    expect(r).toMatchObject({ notes: 2 });
    expect(r.warnings.join(' ')).toMatch(/relation/);
    const t = (await json('GET', `/api/notes/${id}`)).body;
    expect(t).toMatchObject({ onList: true, archived: true, pinned: true, percentDone: 0.5, dueDate: '2031-01-01T00:00:00.000Z', tags: ['t', 'Work.Sub'] });
    expect(t.text).toContain('--- Comments ---');
    expect(t.text).toContain('me, 2030-01-02: hello');
    expect((await json('GET', `/api/notes/${id2}`)).body.onList).toBe(false);
  });
  it('refuses what is not a backup, or is from a newer TurboKeep, with a message and writes nothing', async () => {
    const f = (o: object) => upload('b.json', strToU8(JSON.stringify(o)));
    expect((await json('POST', '/api/import/turbokeep', upload('x.json', strToU8('nope')))).status).toBe(400);
    const wrong = await json('POST', '/api/import/turbokeep', f({ format: 'other', version: 1 }));
    expect(wrong.status).toBe(400); expect(wrong.body.error).toMatch(/not a TurboKeep backup/);
    const newer = await json('POST', '/api/import/turbokeep', f({ format: 'turbokeep', version: 99, notes: [] }));
    expect(newer.status).toBe(400); expect(newer.body.error).toMatch(/newer TurboKeep/);
    const bad = await json('POST', '/api/import/turbokeep', f({ format: 'turbokeep', version: 2, notes: [{ id: 'not-a-uuid', title: 'x' }, { id: '5b3f2c1e-9a4d-4d0e-8f6b-2a1c3d4e5f60', title: 'ok', text: 't' }] }));
    expect(bad.body).toMatchObject({ notes: 1 }); expect(bad.body.warnings[0]).toMatch(/skipped/);
  });
});

async function second2() {
  const app2 = createApp(openDb(':memory:'), cfg, { code: null });
  const reg = await app2.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'second', password: 'longenoughpassword' }) });
  const ck = reg.headers.get('set-cookie')!.split(';')[0]!;
  return { get: async (p: string) => (await (await app2.request(p, { headers: { cookie: ck } })).json()) as any, post: (p: string, d: FormData) => app2.request(p, { method: 'POST', headers: { cookie: ck }, body: d }) };
}

describe('tag looks, list excerpts, compression', () => {
  it('a tag can get an emoji and a colour; with its last note it is deleted, look and all', async () => {
    const n = (await json('POST', '/api/notes', { title: 'a', tags: ['work.reports'] })).body;
    expect((await json('PATCH', '/api/tags', { title: 'work.reports', emoji: '📊', color: '#FF8800' })).status).toBe(200);
    expect((await json('GET', '/api/tags')).body).toEqual([{ title: 'work.reports', emoji: '📊', color: 'ff8800', count: 1 }]);
    expect((await json('PATCH', '/api/tags', { title: 'work.reports', color: 'orange' })).status).toBe(400);
    expect((await json('PATCH', '/api/tags', { title: 'nope', emoji: 'x' })).status).toBe(404);
    await json('PATCH', `/api/notes/${n.id}`, { tags: [] });
    expect((await json('GET', '/api/tags')).body).toEqual([]); // nothing carries it any more: gone, look included
  });
  it('a tag counts only what was sent to tags: a task that carries the tag does not, and the archive has its own counts', async () => {
    await json('POST', '/api/notes', { title: 'filed', tags: ['t'], onList: false });
    await json('POST', '/api/notes', { title: 'task', tags: ['t'], onList: true });
    const old = (await json('POST', '/api/notes', { title: 'old', tags: ['t'], onList: false, archived: true })).body;
    expect((await json('GET', '/api/tags')).body).toEqual([{ title: 't', emoji: '', color: '', count: 1 }]);
    expect((await json('GET', '/api/tags?view=archived')).body).toEqual([{ title: 't', emoji: '', color: '', count: 1 }]);
    expect((await json('GET', '/api/notes?tag=t&list=0')).body.map((n: any) => n.title)).toEqual(['filed']);
    await json('PATCH', `/api/notes/${old.id}`, { archived: false });
    expect((await json('GET', '/api/tags?view=archived')).body).toEqual([{ title: 't', emoji: '', color: '', count: 0 }]);
  });
  it('the archive is in your own order, like Home (the bin shows the latest change first)', async () => {
    const a = (await json('POST', '/api/notes', { title: 'a', onList: true, archived: true })).body, b = (await json('POST', '/api/notes', { title: 'b', onList: true, archived: true })).body;
    await json('POST', `/api/notes/${a.id}/move`, { above: null, below: b.id }); // a above b... b was newest (top); move a to the very top
    expect((await json('GET', '/api/notes?view=archived')).body.map((n: any) => n.title)).toEqual(['a', 'b']);
    await json('POST', `/api/notes/${b.id}/move`, { above: null, below: a.id });
    expect((await json('GET', '/api/notes?view=archived')).body.map((n: any) => n.title)).toEqual(['b', 'a']);
  });
  it('tags on a note keep the order they were given, and a parent lives while a sub-tag has notes', async () => {
    const n = (await json('POST', '/api/notes', { title: 'a', tags: ['zeta', 'alpha.beta', 'mid'] })).body;
    expect(n.tags).toEqual(['zeta', 'alpha.beta', 'mid']);
    expect((await json('PATCH', `/api/notes/${n.id}`, { tags: ['mid', 'zeta', 'alpha.beta'] })).body.tags).toEqual(['mid', 'zeta', 'alpha.beta']);
    expect((await json('PATCH', '/api/tags', { title: 'alpha', emoji: '🅰️' })).status).toBe(200); // the parent has no notes of its own: it gets a row to hold its look
    await json('PATCH', `/api/notes/${n.id}`, { tags: ['mid', 'alpha.beta'] });
    expect((await json('GET', '/api/tags')).body.map((t: any) => t.title)).toEqual(['alpha', 'alpha.beta', 'mid']);
    await json('PATCH', `/api/notes/${n.id}`, { tags: ['mid'] });
    expect((await json('GET', '/api/tags')).body.map((t: any) => t.title)).toEqual(['mid']); // neither the parent nor the child is left
  });
  it('renaming a parent renames what is under it; the tag manager sees every pile', async () => {
    await json('POST', '/api/notes', { title: 'a', tags: ['work.reports'], onList: false });
    await json('POST', '/api/notes', { title: 'b', tags: ['work'], onList: true });
    await json('POST', '/api/notes', { title: 'c', tags: ['work.old'], archived: true });
    await json('POST', '/api/notes', { title: 'd', tags: ['work.old'], trashed: true });
    await json('PATCH', '/api/tags', { from: 'work', to: 'job' });
    expect((await json('GET', '/api/tags?view=all')).body).toEqual([
      { title: 'job', emoji: '', color: '', notes: 0, tasks: 1, archived: 0, trashed: 0 },
      { title: 'job.old', emoji: '', color: '', notes: 0, tasks: 0, archived: 1, trashed: 1 },
      { title: 'job.reports', emoji: '', color: '', notes: 1, tasks: 0, archived: 0, trashed: 0 }]);
    await json('DELETE', '/api/tags?title=job&tree=1');
    expect((await json('GET', '/api/tags?view=all')).body).toEqual([]);
  });
  it('the search language: words, tag:, -tag:, before:, after:, is:, has:', async () => {
    const mk = async (title: string, o: any = {}) => (await json('POST', '/api/notes', { title, ...o })).body;
    await mk('milk run', { tags: ['home', 'shop'], onList: true, dueDate: '2031-01-01T12:00:00Z' });
    await mk('milk powder', { tags: ['shop.food'] });
    await mk('old milk', { tags: ['home.old'], noteType: 'markdown' });
    const titles = async (q: string) => (await json('GET', `/api/notes?q=${encodeURIComponent(q)}`)).body.map((n: any) => n.title).sort();
    expect(await titles('milk')).toEqual(['milk powder', 'milk run', 'old milk']);
    expect(await titles('milk tag:shop')).toEqual(['milk powder', 'milk run']); // a tag also finds what is under it
    expect(await titles('milk tag:shop tag:home')).toEqual(['milk run']); // several tags: all of them
    expect(await titles('milk -tag:home')).toEqual(['milk powder']); // excludes the sub-tag too
    expect(await titles('tag:"home.old"')).toEqual(['old milk']);
    expect(await titles('is:task')).toEqual(['milk run']);
    expect(await titles('milk -is:task is:markdown')).toEqual(['old milk']);
    expect(await titles('has:date')).toEqual(['milk run']);
    expect(await titles('milk before:2000')).toEqual([]);
    expect(await titles(`milk after:2000 before:${new Date().getUTCFullYear() + 1}`)).toEqual(['milk powder', 'milk run', 'old milk']);
    expect(await titles('"milk run"')).toEqual(['milk run']);
    expect(await titles('before:never')).toEqual([]); // a filter that makes no sense is a word nobody has
  });
  it('a title the app made is remembered until you type one of your own', async () => {
    const n = (await json('POST', '/api/notes', { title: 'Friday, 16 Oct 2026 at 09:05', text: 'long long', autoTitle: true })).body;
    expect(n.autoTitle).toBe(true);
    expect((await json('PATCH', `/api/notes/${n.id}`, { text: 'more text' })).body.autoTitle).toBe(true);
    expect((await json('PATCH', `/api/notes/${n.id}`, { title: 'Mine' })).body.autoTitle).toBe(false);
  });
  it('tag counts can include the tasks that carry the tag (a setting of the page)', async () => {
    await json('POST', '/api/notes', { title: 'task', tags: ['t'], onList: true }); await json('POST', '/api/notes', { title: 'note', tags: ['t'] });
    expect((await json('GET', '/api/tags')).body[0].count).toBe(1);
    expect((await json('GET', '/api/tags?tasks=1')).body[0].count).toBe(2);
  });
  it('archiving a task that has tags sends it to them, unless a tag says its tasks stay tasks', async () => {
    const a = (await json('POST', '/api/notes', { title: 'a', tags: ['plain'], onList: true })).body, b = (await json('POST', '/api/notes', { title: 'b', tags: ['keeper'], onList: true })).body;
    const c = (await json('POST', '/api/notes', { title: 'c', onList: true })).body;
    await json('PATCH', '/api/tags', { title: 'keeper', keepTasks: true });
    expect((await json('PATCH', `/api/notes/${a.id}`, { archived: true })).body).toMatchObject({ archived: true, onList: false });
    expect((await json('PATCH', `/api/notes/${b.id}`, { archived: true })).body).toMatchObject({ archived: true, onList: true });
    expect((await json('PATCH', `/api/notes/${c.id}`, { archived: true })).body).toMatchObject({ archived: true, onList: true }); // no tags: stays a task
    expect((await json('GET', '/api/tags')).body.find((t: any) => t.title === 'keeper').keepTasks).toBe(true);
  });
  it('a retired tag is flagged in the lists and survives a backup', async () => {
    await json('POST', '/api/notes', { title: 'old', tags: ['old food'] });
    await json('PATCH', '/api/tags', { title: 'old food', retired: true });
    expect((await json('GET', '/api/tags')).body.find((t: any) => t.title === 'old food').retired).toBe(true);
    expect((await json('GET', '/api/tags?view=all')).body.find((t: any) => t.title === 'old food').retired).toBe(true);
    await json('PATCH', '/api/tags', { title: 'old food', retired: false });
    expect((await json('GET', '/api/tags')).body.find((t: any) => t.title === 'old food').retired).toBeUndefined();
  });
  it('exclude: and include: are -tag: and tag:', async () => {
    await json('POST', '/api/notes', { title: 'a milk', tags: ['x'] }); await json('POST', '/api/notes', { title: 'b milk', tags: ['y'] });
    const titles = async (q: string) => (await json('GET', `/api/notes?q=${encodeURIComponent(q)}`)).body.map((n: any) => n.title).sort();
    expect(await titles('milk exclude:x')).toEqual(['b milk']);
    expect(await titles('milk excludes:x')).toEqual(['b milk']);
    expect(await titles('milk include:x')).toEqual(['a milk']);
    expect(await titles('milk -exclude:x')).toEqual(['a milk']);
  });
  it('imported emoji: small PNG or WebP only, served with a long cache, used by a tag, kept by the backup', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    expect((await json('POST', '/api/emoji', { name: 'x', data: Buffer.from('not a picture').toString('base64') })).status).toBe(400);
    const e = (await json('POST', '/api/emoji', { name: 'blob', data: png })).body;
    expect(e.id).toMatch(/^[0-9a-f]{12}$/);
    const img = await app.request(`/api/emoji/${e.id}`, { headers: { cookie } });
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(img.headers.get('cache-control')).toContain('immutable');
    await json('POST', '/api/notes', { title: 'a', tags: ['t'] });
    expect((await json('PATCH', '/api/tags', { title: 't', emoji: `:${e.id}:` })).status).toBe(200);
    expect((await json('GET', '/api/tags')).body[0].emoji).toBe(`:${e.id}:`);
    await json('PATCH', '/api/tags', { title: 't', emoji: ':000000000000:' }); // not yours: no emoji
    expect((await json('GET', '/api/tags')).body[0].emoji).toBe('');
    await json('PATCH', '/api/tags', { title: 't', emoji: `:${e.id}:` });
    const zip = new Uint8Array(await (await app.request('/api/export/turbokeep', { headers: { cookie } })).arrayBuffer());
    await json('DELETE', `/api/emoji/${e.id}`);
    expect((await json('GET', '/api/tags')).body[0].emoji).toBe(''); // a tag does not keep a picture that is gone
    expect((await json('GET', '/api/emoji')).body).toEqual([]);
    await json('POST', '/api/import/turbokeep', upload('b.zip', zip)); // the backup brings the picture back, and the tag's look with it
    expect((await json('GET', '/api/emoji')).body.map((x: any) => x.id)).toEqual([e.id]);
    expect((await json('GET', '/api/tags')).body[0].emoji).toBe(`:${e.id}:`);
  });
  it('renaming onto an existing tag keeps a look', async () => {
    await json('POST', '/api/notes', { title: 'a', tags: ['one'] }); await json('POST', '/api/notes', { title: 'b', tags: ['two'] });
    await json('PATCH', '/api/tags', { title: 'one', emoji: '1️⃣' });
    await json('PATCH', '/api/tags', { from: 'one', to: 'two' });
    expect((await json('GET', '/api/tags')).body).toEqual([{ title: 'two', emoji: '1️⃣', color: '', count: 2 }]);
  });
  it('the TurboKeep backup carries tag looks, and an import only fills tags that have none', async () => {
    await json('POST', '/api/notes', { title: 'a', tags: ['red'] });
    await json('PATCH', '/api/tags', { title: 'red', emoji: '🔴', color: 'ff0000' });
    const zip = new Uint8Array(await (await call('GET', '/api/export/turbokeep')).arrayBuffer());
    expect(JSON.parse(new TextDecoder().decode(unzipSync(zip)['turbokeep.json'])).tagStyles).toEqual([{ title: 'red', emoji: '🔴', color: 'ff0000' }]);
    const app2 = createApp(openDb(':memory:'), cfg, { code: null });
    const reg = await app2.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'two', password: 'longenoughpassword' }) });
    const ck = reg.headers.get('set-cookie')!.split(';')[0]!;
    await app2.request('/api/import/turbokeep', { method: 'POST', headers: { cookie: ck }, body: upload('b.zip', zip) });
    expect(await (await app2.request('/api/tags', { headers: { cookie: ck } })).json()).toEqual([{ title: 'red', emoji: '🔴', color: 'ff0000', count: 1 }]);
  });
  it('excerpt=1 shortens long texts in the list, the note itself stays whole', async () => {
    const n = (await json('POST', '/api/notes', { title: 'long', text: 'x'.repeat(1000) })).body;
    expect((await json('GET', '/api/notes?excerpt=1')).body[0].text).toHaveLength(400);
    expect((await json('GET', '/api/notes')).body[0].text).toHaveLength(1000);
    expect((await json('GET', `/api/notes/${n.id}`)).body.text).toHaveLength(1000);
  });
  it('answers are compressed when the browser accepts it', async () => {
    await json('POST', '/api/notes', { title: 'long', text: 'word '.repeat(2000) });
    const r = await call('GET', '/api/notes', undefined, { 'accept-encoding': 'gzip' });
    expect(r.headers.get('content-encoding')).toBe('gzip');
    expect(((await r.arrayBuffer()).byteLength)).toBeLessThan(2000);
  });
});
