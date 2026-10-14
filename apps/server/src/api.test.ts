import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, unzipSync } from 'fflate';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { nextDates } from './store.ts';
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

describe('tasks', () => {
  it('puts tasks in the Inbox, with labels, reminders and relations (both directions)', async () => {
    const projects = (await json('GET', '/api/projects')).body;
    expect(projects[0]).toMatchObject({ title: 'Inbox', isInbox: true });
    const a = (await json('POST', '/api/tasks', { title: 'Plan trip', tags: ['travel'], priority: 4, dueDate: '2030-01-01T10:00:00Z', reminders: [{ reminder: '2029-12-31T10:00:00Z' }] })).body;
    const b = (await json('POST', '/api/tasks', { title: 'Book flights' })).body;
    expect(a.projectId).toBe(projects[0].id);
    expect(a.tags).toEqual(['travel']);
    const rel = (await json('POST', `/api/tasks/${a.id}/relations`, { otherId: b.id, kind: 'subtask' })).body;
    expect(rel.related.subtask[0].id).toBe(b.id);
    expect((await json('GET', `/api/tasks/${b.id}`)).body.related.parenttask[0].id).toBe(a.id);
    expect((await json('GET', '/api/tasks?done=false&q=flights')).body).toHaveLength(1);
    expect((await json('GET', '/api/tasks?tag=travel')).body).toHaveLength(1);
    await json('PATCH', `/api/tasks/${b.id}`, { done: true });
    expect((await json('GET', '/api/tasks?done=true')).body[0].doneAt).toBeTruthy();
  });
  it('a repeating task stays open and moves its due date on', async () => {
    const t = (await json('POST', '/api/tasks', { title: 'Water plants', dueDate: '2020-01-01T08:00:00Z', repeatAfter: 86400 })).body;
    const r = (await json('PATCH', `/api/tasks/${t.id}`, { done: true })).body;
    expect(r.done).toBe(false);
    expect(new Date(r.dueDate).getTime()).toBeGreaterThan(Date.now());
  });
  it('nextDates: from-current-date and monthly modes', () => {
    const at = new Date('2024-06-10T12:00:00Z');
    expect(nextDates({ due_date: '2024-06-01T09:00:00Z', start_date: null, end_date: null, repeat_after: 3600, repeat_mode: 2 }, at).due_date).toBe('2024-06-10T13:00:00.000Z');
    expect(nextDates({ due_date: '2024-06-01T09:00:00Z', start_date: null, end_date: null, repeat_after: 0, repeat_mode: 1 }, at).due_date).toBe('2024-07-01T09:00:00.000Z');
  });
  it('refuses to delete the Inbox or nest a project in itself', async () => {
    const inbox = (await json('GET', '/api/projects')).body[0];
    expect((await json('DELETE', `/api/projects/${inbox.id}`)).status).toBe(400);
    const p = (await json('POST', '/api/projects', { title: 'A' })).body;
    const q = (await json('POST', '/api/projects', { title: 'B', parentId: p.id })).body;
    expect((await json('PATCH', `/api/projects/${p.id}`, { parentId: q.id })).status).toBe(400);
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
  it('Vikunja: export, import into a second account, nothing important lost', async () => {
    const proj = (await json('POST', '/api/projects', { title: 'Work', hexColor: 'ff8800' })).body;
    const sub = (await json('POST', '/api/projects', { title: 'Sub', parentId: proj.id })).body;
    const a = (await json('POST', '/api/tasks', { title: 'Write report', projectId: proj.id, tags: ['urgent'], priority: 5, dueDate: '2031-03-04T05:06:07Z', description: '<p>hi</p>', repeatAfter: 604800, reminders: [{ reminder: '2031-03-03T05:06:07Z' }] })).body;
    const b = (await json('POST', '/api/tasks', { title: 'Collect data', projectId: sub.id, done: true })).body;
    await json('POST', `/api/tasks/${a.id}/relations`, { otherId: b.id, kind: 'blocked' });
    await json('DELETE', `/api/tasks/${a.id}/relations/${b.id}/blocked`);
    await json('POST', `/api/tasks/${a.id}/comments`, { comment: 'started' });
    await json('POST', `/api/tasks/${a.id}/relations`, { otherId: b.id, kind: 'subtask' });
    const exp = await call('GET', '/api/export/vikunja?relations=all');
    expect(exp.headers.get('x-dropped-relations')).toBe('0');
    const zip = new Uint8Array(await exp.arrayBuffer());
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['VERSION', 'data.json']);

    cookie = '';
    const two = createApp(openDb(':memory:'), cfg, { code: null });
    const reg = await two.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'second', password: 'longenoughpassword' }) });
    const c2 = reg.headers.get('set-cookie')!.split(';')[0]!;
    const res = await two.request('/api/import/vikunja', { method: 'POST', headers: { cookie: c2 }, body: upload('v.zip', zip) });
    const report = await res.json() as any;
    expect(report).toMatchObject({ projects: 2, tasks: 2, tags: 1, comments: 1, relations: 1 });
    const get = async (p: string) => (await (await two.request(p, { headers: { cookie: c2 } })).json()) as any;
    const projects = await get('/api/projects');
    const work = projects.find((p: any) => p.title === 'Work'), subp = projects.find((p: any) => p.title === 'Sub');
    expect(work.hexColor).toBe('ff8800');
    expect(subp.parentId).toBe(work.id);
    const tasks = await get('/api/tasks');
    const t = tasks.find((x: any) => x.title === 'Write report'), u = tasks.find((x: any) => x.title === 'Collect data');
    expect(t).toMatchObject({ priority: 5, dueDate: '2031-03-04T05:06:07.000Z', description: '<p>hi</p>', repeatAfter: 604800, tags: ['urgent'], reminders: [{ reminder: '2031-03-03T05:06:07.000Z' }] });
    expect(u.done).toBe(true);
    expect(t.related.subtask[0].id).toBe(u.id);
    expect((await get(`/api/tasks/${t.id}`)).comments[0].comment).toBe('started');
  });
  it('export of an empty account is still a valid file', async () => {
    const zip = new Uint8Array(await (await call('GET', '/api/export/vikunja')).arrayBuffer());
    expect(JSON.parse(new TextDecoder().decode(unzipSync(zip)['data.json']))[0]).toMatchObject({ title: 'Inbox', tasks: [] });
  });
});

describe('a genuine Vikunja export', () => {
  // made by a real Vikunja 0.24.6 (Settings > Export): 2 inboxes, a project with a parent task, two subtasks that follow each other
  it('imports: the empty inbox merges into ours, relations keep their kinds, nothing doubles', async () => {
    const { readFileSync } = await import('node:fs');
    const zip = new Uint8Array(readFileSync(new URL('../test/fixtures/vikunja-0.24.6-export.zip', import.meta.url)));
    const r = (await json('POST', '/api/import/vikunja', upload('export.zip', zip))).body;
    expect(r).toMatchObject({ projects: 1, tasks: 4 });
    const tasks = (await json('GET', '/api/tasks')).body;
    expect(tasks.map((t: any) => t.title).sort()).toEqual(['Child 1', 'Child 2', 'Elsewhere', 'Parent']);
    const parent = tasks.find((t: any) => t.title === 'Parent');
    expect(parent.related.subtask.map((x: any) => x.title)).toEqual(['Child 1', 'Child 2']);
    expect(tasks.find((t: any) => t.title === 'Child 1').related.precedes[0].title).toBe('Child 2');
    expect((await json('GET', '/api/projects')).body.map((p: any) => p.title)).toEqual(['Inbox', 'Work']);
  });
});

describe('a note can be a task', () => {
  it('PUT makes a task from a note; the title, text and tags are the note\'s, and the list shows both kinds', async () => {
    const note = (await json('POST', '/api/notes', { title: 'Plan trip', text: 'flights\nhotel', tags: ['travel'] })).body;
    await json('POST', '/api/notes', { title: 'Just a note', text: 'no task here' });
    expect(note.task).toBeNull();
    const t = (await json('PUT', `/api/notes/${note.id}/task`, { dueDate: '2031-05-06T07:08:09Z', priority: 3, isFavorite: true })).body;
    expect(t).toMatchObject({ noteId: note.id, title: 'Plan trip', description: 'flights\nhotel', tags: ['travel'], priority: 3, done: false });
    expect((await json('PUT', `/api/notes/${note.id}/task`, {})).status).toBe(409); // already a task
    const all = (await json('GET', '/api/notes')).body;
    expect(all.map((n: any) => [n.title, !!n.task]).sort()).toEqual([['Just a note', false], ['Plan trip', true]]);
    expect(all.find((n: any) => n.title === 'Plan trip').task).toMatchObject({ id: t.id, priority: 3, isFavorite: true, dueDate: '2031-05-06T07:08:09.000Z' });
    expect((await json('GET', '/api/notes?kind=tasks')).body.map((n: any) => n.title)).toEqual(['Plan trip']);
    expect((await json('GET', '/api/notes?kind=notes')).body.map((n: any) => n.title)).toEqual(['Just a note']);
    expect((await json('GET', '/api/notes?favorites=1')).body).toHaveLength(1);
    expect((await json('GET', `/api/notes/${note.id}`)).body.task).toMatchObject({ id: t.id, comments: [], reminders: [] }); // the detail has the whole task
  });
  it('done=false hides finished tasks but keeps plain notes; done=true shows only finished tasks', async () => {
    const a = (await json('POST', '/api/tasks', { title: 'Open task' })).body;
    const b = (await json('POST', '/api/tasks', { title: 'Done task' })).body;
    await json('POST', '/api/notes', { title: 'Plain' });
    await json('PATCH', `/api/notes/${b.noteId}/task`, { done: true });
    expect((await json('GET', '/api/notes?done=false')).body.map((n: any) => n.title).sort()).toEqual(['Open task', 'Plain']);
    expect((await json('GET', '/api/notes?done=true')).body.map((n: any) => n.title)).toEqual(['Done task']);
    expect(a.noteId).toBeTruthy();
  });
  it('a task made through /api/tasks is a note too, and editing either side edits both', async () => {
    const t = (await json('POST', '/api/tasks', { title: 'Buy milk', description: '2 litres', tags: ['home'] })).body;
    expect((await json('GET', `/api/notes/${t.noteId}`)).body).toMatchObject({ title: 'Buy milk', text: '2 litres', tags: ['home'] });
    await json('PATCH', `/api/notes/${t.noteId}`, { title: 'Buy oat milk', text: '3 litres', tags: ['home', 'food'] });
    expect((await json('GET', `/api/tasks/${t.id}`)).body).toMatchObject({ title: 'Buy oat milk', description: '3 litres', tags: ['food', 'home'] });
    await json('PATCH', `/api/tasks/${t.id}`, { title: 'Buy almond milk' });
    expect((await json('GET', `/api/notes/${t.noteId}`)).body.title).toBe('Buy almond milk');
    expect((await json('GET', '/api/notes?q=almond')).body).toHaveLength(1);
    expect((await json('GET', '/api/tasks?q=almond')).body).toHaveLength(1);
  });
  it('taking the task off keeps the note; deleting the task or the note removes both; the trash hides tasks', async () => {
    const a = (await json('POST', '/api/tasks', { title: 'Detach me' })).body;
    expect((await json('DELETE', `/api/notes/${a.noteId}/task`)).status).toBe(200);
    expect((await json('GET', `/api/notes/${a.noteId}`)).body.task).toBeNull();
    expect((await json('GET', `/api/tasks/${a.id}`)).status).toBe(404);
    expect((await json('DELETE', `/api/notes/${a.noteId}/task`)).status).toBe(404);

    const b = (await json('POST', '/api/tasks', { title: 'Delete the task' })).body;
    await json('DELETE', `/api/tasks/${b.id}`);
    expect((await json('GET', `/api/notes/${b.noteId}`)).status).toBe(404); // a task is a note: both go

    const c = (await json('POST', '/api/tasks', { title: 'Trash the note' })).body;
    await json('PATCH', `/api/notes/${c.noteId}`, { trashed: true });
    expect((await json('GET', '/api/tasks')).body.map((t: any) => t.title)).not.toContain('Trash the note');
    expect((await json('GET', '/api/notes?view=trashed')).body.map((n: any) => n.title)).toContain('Trash the note');
    await json('DELETE', `/api/notes/${c.noteId}`);
    expect((await json('GET', `/api/tasks/${c.id}`)).status).toBe(404);
  });
  it('relations and comments follow the task, with the note\'s title', async () => {
    const a = (await json('POST', '/api/tasks', { title: 'Parent' })).body;
    const b = (await json('POST', '/api/tasks', { title: 'Child' })).body;
    await json('POST', `/api/tasks/${a.id}/relations`, { otherId: b.id, kind: 'subtask' });
    await json('POST', `/api/tasks/${a.id}/comments`, { comment: 'remember this' });
    const d = (await json('GET', `/api/notes/${a.noteId}`)).body.task;
    expect(d.related.subtask[0]).toMatchObject({ title: 'Child', noteId: b.noteId });
    expect(d.comments[0].comment).toBe('remember this');
    await json('PATCH', `/api/notes/${b.noteId}`, { title: 'Renamed child' });
    expect((await json('GET', `/api/tasks/${a.id}`)).body.related.subtask[0].title).toBe('Renamed child');
  });
});

describe('TurboKeep backup (notes and tasks together)', () => {
  async function seed() {
    const work = (await json('POST', '/api/projects', { title: 'Work', hexColor: 'ff8800' })).body;
    const sub = (await json('POST', '/api/projects', { title: 'Sub', parentId: work.id, isArchived: false })).body;
    const note = (await json('POST', '/api/notes', { title: 'Meeting notes', text: 'agenda', tags: ['work'], pinned: true, noteType: 'markdown' })).body;
    const gone = (await json('POST', '/api/notes', { title: 'Old', text: 'x', archived: true })).body;
    const a = (await json('POST', '/api/tasks', { title: 'Write report', description: 'draft first', projectId: work.id, tags: ['work', 'urgent'], priority: 4, dueDate: '2031-03-04T05:06:07Z', repeatAfter: 604800, reminders: [{ reminder: '2031-03-03T05:06:07Z' }, { relativeTo: 'due_date', relativePeriod: -3600 }] })).body;
    const b = (await json('POST', '/api/tasks', { title: 'Collect data', projectId: sub.id, done: true })).body;
    await json('POST', `/api/tasks/${a.id}/relations`, { otherId: b.id, kind: 'subtask' });
    await json('POST', `/api/tasks/${a.id}/comments`, { comment: 'started' });
    const trashed = (await json('POST', '/api/notes', { title: 'In the trash', trashed: true })).body;
    return { work, sub, note, gone, a, b, trashed };
  }
  const exportZip = async () => new Uint8Array(await (await call('GET', '/api/export/turbokeep')).arrayBuffer());
  const second = async () => {
    const app2 = createApp(openDb(':memory:'), cfg, { code: null });
    const reg = await app2.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'second', password: 'longenoughpassword' }) });
    const ck = reg.headers.get('set-cookie')!.split(';')[0]!;
    return { app2, get: async (p: string) => (await (await app2.request(p, { headers: { cookie: ck } })).json()) as any, post: (p: string, d: FormData) => app2.request(p, { method: 'POST', headers: { cookie: ck }, body: d }) };
  };

  it('exports one file with the format and version, everything in it, the trash and archive included', async () => {
    await seed();
    const zip = await exportZip();
    expect(Object.keys(unzipSync(zip))).toEqual(['turbokeep.json']);
    const j = JSON.parse(new TextDecoder().decode(unzipSync(zip)['turbokeep.json']));
    expect(j).toMatchObject({ format: 'turbokeep', version: 1 });
    expect(j.notes).toHaveLength(5); // Meeting notes, Old (archived), In the trash, and the notes of the 2 tasks
    expect(j.notes.filter((n: any) => n.task)).toHaveLength(2);
    expect(j.notes.find((n: any) => n.title === 'Write report')).toMatchObject({ text: 'draft first', tags: ['urgent', 'work'], task: { priority: 4, repeatAfter: 604800, comments: [{ comment: 'started' }] } });
    expect(j.relations.length).toBe(2); // both directions are stored
    expect(j.projects.map((p: any) => p.title)).toEqual(['Inbox', 'Work', 'Sub']);
  });

  it('into another account: the same notes, tasks, projects, tags, reminders, comments and relations', async () => {
    await seed();
    const zip = await exportZip();
    const b = await second();
    const dry = await (await b.post('/api/import/turbokeep?dry=1', upload('x.zip', zip))).json() as any;
    expect(dry).toMatchObject({ dry: true, notes: 5, tasks: 2, projects: 2, comments: 1, relations: 1 });
    expect((await b.get('/api/notes?view=all')).length).toBe(0); // the preview wrote nothing
    const real = await (await b.post('/api/import/turbokeep', upload('x.zip', zip))).json() as any;
    expect(real).toMatchObject({ notes: 5, tasks: 2, projects: 2, comments: 1, relations: 1, skipped: 0, dry: false });
    const notes = await b.get('/api/notes?view=all');
    expect(notes.map((n: any) => [n.title, n.pinned, n.archived, n.trashed, !!n.task]).sort()).toEqual([
      ['Collect data', false, false, false, true], ['In the trash', false, false, true, false], ['Meeting notes', true, false, false, false], ['Old', false, true, false, false], ['Write report', false, false, false, true],
    ]);
    const report = notes.find((n: any) => n.title === 'Write report');
    const detail = await b.get(`/api/notes/${report.id}`);
    expect(detail).toMatchObject({ text: 'draft first', tags: ['urgent', 'work'], noteType: 'plain-text' });
    expect(detail.task).toMatchObject({ priority: 4, repeatAfter: 604800, dueDate: '2031-03-04T05:06:07.000Z', comments: [{ comment: 'started' }] });
    expect(detail.task.reminders).toHaveLength(2);
    expect(detail.task.related.subtask[0].title).toBe('Collect data');
    const projects = await b.get('/api/projects');
    const work = projects.find((p: any) => p.title === 'Work'), sub = projects.find((p: any) => p.title === 'Sub');
    expect(work.hexColor).toBe('ff8800'); expect(sub.parentId).toBe(work.id);
    expect(detail.task.projectId).toBe(work.id);
    expect((await b.get('/api/notes?kind=notes')).find((n: any) => n.title === 'Meeting notes')).toMatchObject({ pinned: true, noteType: 'markdown' });
  });

  it('importing it again changes nothing, and after deleting everything it restores everything', async () => {
    await seed();
    const zip = await exportZip();
    const again = (await json('POST', '/api/import/turbokeep', upload('x.zip', zip))).body;
    expect(again).toMatchObject({ notes: 0, tasks: 0, projects: 0, skipped: 5 });
    expect((await json('GET', '/api/notes?view=all')).body).toHaveLength(5);
    for (const n of (await json('GET', '/api/notes?view=all')).body) await json('DELETE', `/api/notes/${n.id}`);
    for (const p of (await json('GET', '/api/projects')).body) if (!p.isInbox) await json('DELETE', `/api/projects/${p.id}`);
    expect((await json('GET', '/api/notes?view=all')).body).toHaveLength(0);
    const back = (await json('POST', '/api/import/turbokeep', upload('x.zip', zip))).body;
    expect(back).toMatchObject({ notes: 5, tasks: 2, projects: 2, relations: 1 });
    expect((await json('GET', '/api/notes?kind=tasks&done=false')).body.map((n: any) => n.title)).toEqual(['Write report']);
  });

  it('refuses what is not a backup, or is from a newer TurboKeep, with a message and writes nothing', async () => {
    const f = (o: object) => upload('b.json', strToU8(JSON.stringify(o)));
    expect((await json('POST', '/api/import/turbokeep', upload('x.json', strToU8('nope')))).status).toBe(400);
    const wrong = await json('POST', '/api/import/turbokeep', f({ format: 'other', version: 1 }));
    expect(wrong.status).toBe(400); expect(wrong.body.error).toMatch(/not a TurboKeep backup/);
    const newer = await json('POST', '/api/import/turbokeep', f({ format: 'turbokeep', version: 99, notes: [] }));
    expect(newer.status).toBe(400); expect(newer.body.error).toMatch(/newer TurboKeep/);
    const bad = await json('POST', '/api/import/turbokeep', f({ format: 'turbokeep', version: 1, notes: [{ id: 'not-a-uuid', title: 'x' }, { id: '5b3f2c1e-9a4d-4d0e-8f6b-2a1c3d4e5f60', title: 'ok', text: 't' }] }));
    expect(bad.body).toMatchObject({ notes: 1 }); expect(bad.body.warnings[0]).toMatch(/skipped/);
  });
});

describe('tag looks, list excerpts, compression', () => {
  it('a tag can get an emoji and a colour, and keeps them when its last note goes', async () => {
    const n = (await json('POST', '/api/notes', { title: 'a', tags: ['work.reports'] })).body;
    expect((await json('PATCH', '/api/tags', { title: 'work.reports', emoji: '📊', color: '#FF8800' })).status).toBe(200);
    expect((await json('GET', '/api/tags')).body).toEqual([{ title: 'work.reports', emoji: '📊', color: 'ff8800', count: 1 }]);
    expect((await json('PATCH', '/api/tags', { title: 'work.reports', color: 'orange' })).status).toBe(400);
    expect((await json('PATCH', '/api/tags', { title: 'nope', emoji: 'x' })).status).toBe(404);
    await json('PATCH', `/api/notes/${n.id}`, { tags: [] });
    expect((await json('GET', '/api/tags')).body).toEqual([{ title: 'work.reports', emoji: '📊', color: 'ff8800', count: 0 }]); // styled: kept
    await json('PATCH', '/api/tags', { title: 'work.reports', emoji: '', color: '' });
    await json('PATCH', `/api/notes/${n.id}`, { tags: ['x'] }); await json('PATCH', `/api/notes/${n.id}`, { tags: [] });
    expect((await json('GET', '/api/tags')).body).toEqual([]); // plain: removed with its last note
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
