import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Config } from './config.ts';
import { type DB, all, get, run } from './db.ts';
import { COOKIE, LoginLimiter, type AuthUser, clientIp, createSession, hashPassword, isHttps, requireAuth, verifyPassword } from './auth.ts';
import * as S from './store.ts';
import { exportStandardNotes, exportTurboKeep, exportVikunja, importStandardNotes, importTurboKeep, importVikunja } from './io.ts';
import { VERSION } from './version.ts';

export { VERSION };
type Env = { Variables: { user: AuthUser } };

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };

const int = (v: string | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : undefined; };
const USERNAME = /^[A-Za-z0-9_.-]{2,40}$/;

export function createApp(db: DB, cfg: Config, setup: { code: string | null } = { code: null }) {
  const app = new Hono<Env>();
  const limiter = new LoginLimiter();
  const auth = requireAuth(db, cfg);
  const userCount = () => Number(get(db, 'select count(*) c from users')!.c);

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Frame-Options', 'DENY');
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
  });

  app.onError((e, c) => {
    if (e instanceof S.HttpError) return c.json({ error: e.message, ...e.extra }, e.status);
    console.error(e);
    return c.json({ error: 'Something went wrong on the server' }, 500);
  });

  // ---- public ----
  app.get('/api/health', (c) => c.json({ ok: true, version: VERSION }));
  app.get('/api/setup', (c) => c.json({ needsSetup: userCount() === 0, setupCodeRequired: userCount() === 0 && !!setup.code, allowSignup: cfg.allowSignup, version: VERSION }));

  const startSession = (c: any, userId: number) => {
    const { secret } = createSession(db, userId, 'session', c.req.header('user-agent')?.slice(0, 80) ?? '', cfg.sessionDays);
    setCookie(c, COOKIE, secret, { httpOnly: true, sameSite: 'Lax', secure: isHttps(c, cfg), path: '/', maxAge: cfg.sessionDays * 86400 });
  };

  app.post('/api/auth/register', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const first = userCount() === 0;
    if (!first && !cfg.allowSignup) throw new S.HttpError(403, 'Sign-ups are closed on this server');
    if (first && setup.code && b.setupCode !== setup.code) throw new S.HttpError(403, 'Wrong setup code. It is printed in the server log when it starts.');
    const username = String(b.username ?? '').trim(), password = String(b.password ?? '');
    if (!USERNAME.test(username)) throw new S.HttpError(400, 'Username: 2 to 40 letters, digits, dot, dash or underscore');
    if (password.length < 10) throw new S.HttpError(400, 'Use a password of at least 10 characters');
    if (get(db, 'select 1 x from users where username = ?', username)) throw new S.HttpError(409, 'That username is taken');
    const id = S.createUser(db, username, hashPassword(password));
    if (first) setup.code = null;
    startSession(c, id);
    return c.json({ user: { id, username } }, 201);
  });

  app.post('/api/auth/login', async (c) => {
    const ip = clientIp(c, cfg);
    if (limiter.blocked(ip)) throw new S.HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    const b = await c.req.json().catch(() => ({}));
    const u = get(db, 'select * from users where username = ?', String(b.username ?? '').trim());
    // hash even for an unknown name so the answer takes as long either way
    const ok = verifyPassword(String(b.password ?? ''), u?.password_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==') && !!u;
    if (!ok) { limiter.fail(ip); throw new S.HttpError(401, 'Wrong username or password'); }
    limiter.clear(ip);
    startSession(c, u!.id);
    return c.json({ user: { id: u!.id, username: u!.username } });
  });

  // ---- signed in ----
  app.use('/api/*', async (c, next) => (['/api/health', '/api/setup', '/api/auth/register', '/api/auth/login'].includes(c.req.path) ? next() : auth(c, next)));

  app.post('/api/auth/logout', (c) => {
    run(db, 'delete from sessions where token_hash = ?', c.get('user').tokenHash);
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
  app.get('/api/auth/me', (c) => c.json({ user: { id: c.get('user').id, username: c.get('user').username } }));
  app.post('/api/auth/password', async (c) => {
    const u = c.get('user'), b = await c.req.json().catch(() => ({}));
    const row = get(db, 'select * from users where id = ?', u.id)!;
    if (!verifyPassword(String(b.current ?? ''), row.password_hash)) throw new S.HttpError(403, 'The current password is wrong');
    if (String(b.next ?? '').length < 10) throw new S.HttpError(400, 'Use a password of at least 10 characters');
    run(db, 'update users set password_hash = ? where id = ?', hashPassword(String(b.next)), u.id);
    run(db, "delete from sessions where user_id = ? and kind = 'session' and token_hash != ?", u.id, u.tokenHash); // sign out other devices
    return c.json({ ok: true });
  });

  app.get('/api/tokens', (c) => c.json(all(db, "select name, created_at, last_used, token_hash from sessions where user_id = ? and kind = 'api' order by created_at", c.get('user').id).map((r) => ({ id: r.token_hash.slice(0, 16), name: r.name, createdAt: r.created_at, lastUsed: r.last_used }))));
  app.post('/api/tokens', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const { secret } = createSession(db, c.get('user').id, 'api', String(b.name ?? 'API token').slice(0, 60), null);
    return c.json({ token: secret }, 201);
  });
  app.delete('/api/tokens/:id', (c) => { run(db, "delete from sessions where user_id = ? and kind = 'api' and substr(token_hash,1,16) = ?", c.get('user').id, c.req.param('id')); return c.json({ ok: true }); });

  // ---- notes (a note can carry a task) ----
  const uid = (c: any) => (c.get('user') as AuthUser).id;
  const body = async (c: any) => (await c.req.json().catch(() => { throw new S.HttpError(400, 'Invalid JSON'); })) ?? {};
  const bool3 = (v: string | undefined) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1');
  app.get('/api/notes', (c) => {
    const q = c.req.query();
    return c.json(S.listNotes(db, uid(c), { view: (q.view as any) || 'notes', kind: (q.kind as any) || 'all', tag: q.tag || undefined, q: q.q || undefined, done: bool3(q.done), due: q.due as any, favorites: q.favorites === '1', projectId: int(q.project) }));
  });
  app.post('/api/notes', async (c) => c.json(S.createNote(db, uid(c), await body(c)), 201));
  app.post('/api/notes/empty-trash', (c) => c.json({ deleted: S.emptyTrash(db, uid(c)) }));
  app.get('/api/notes/:id', (c) => c.json(S.getNoteDetail(db, uid(c), c.req.param('id'))));
  app.patch('/api/notes/:id', async (c) => { const b = await body(c); return c.json(S.updateNote(db, uid(c), c.req.param('id'), b, typeof b.base === 'string' ? b.base : undefined)); });
  app.delete('/api/notes/:id', (c) => { S.deleteNote(db, uid(c), c.req.param('id')); return c.json({ ok: true }); });
  // the task of a note: make one, change it, take it off (the note stays)
  app.put('/api/notes/:id/task', async (c) => c.json(S.createTask(db, uid(c), { ...(await body(c)), noteId: c.req.param('id') }), 201));
  app.patch('/api/notes/:id/task', async (c) => { const n = S.getNote(db, uid(c), c.req.param('id')); if (!n.task) throw new S.HttpError(404, 'That note is not a task'); return c.json(S.updateTask(db, uid(c), n.task.id, await body(c))); });
  app.delete('/api/notes/:id/task', (c) => { S.detachTask(db, uid(c), c.req.param('id')); return c.json({ ok: true }); });
  app.get('/api/tags', (c) => c.json(S.listTags(db, uid(c))));
  app.patch('/api/tags', async (c) => { const b = await body(c); S.renameTag(db, uid(c), String(b.from ?? ''), String(b.to ?? '')); return c.json({ ok: true }); });
  app.delete('/api/tags', (c) => { S.deleteTag(db, uid(c), c.req.query('title') ?? ''); return c.json({ ok: true }); });

  // ---- projects and tasks ----
  app.get('/api/projects', (c) => c.json(S.listProjects(db, uid(c))));
  app.post('/api/projects', async (c) => c.json(S.createProject(db, uid(c), await body(c)), 201));
  app.patch('/api/projects/:id', async (c) => c.json(S.updateProject(db, uid(c), Number(c.req.param('id')), await body(c))));
  app.delete('/api/projects/:id', (c) => { S.deleteProject(db, uid(c), Number(c.req.param('id'))); return c.json({ ok: true }); });

  app.get('/api/tasks', (c) => {
    const q = c.req.query();
    return c.json(S.listTasks(db, uid(c), { projectId: int(q.project), done: bool3(q.done), q: q.q, due: q.due as any, tag: q.tag || q.label || undefined, favorites: q.favorites === '1' }));
  });
  app.post('/api/tasks', async (c) => c.json(S.createTask(db, uid(c), await body(c)), 201));
  app.get('/api/tasks/:id', (c) => c.json(S.getTask(db, uid(c), Number(c.req.param('id')))));
  app.patch('/api/tasks/:id', async (c) => c.json(S.updateTask(db, uid(c), Number(c.req.param('id')), await body(c))));
  app.delete('/api/tasks/:id', (c) => { S.deleteTask(db, uid(c), Number(c.req.param('id'))); return c.json({ ok: true }); });
  app.post('/api/tasks/:id/relations', async (c) => { const b = await body(c); S.addRelation(db, uid(c), Number(c.req.param('id')), Number(b.otherId), String(b.kind)); return c.json(S.getTask(db, uid(c), Number(c.req.param('id')))); });
  app.delete('/api/tasks/:id/relations/:other/:kind', (c) => { S.removeRelation(db, uid(c), Number(c.req.param('id')), Number(c.req.param('other')), c.req.param('kind')); return c.json(S.getTask(db, uid(c), Number(c.req.param('id')))); });
  app.post('/api/tasks/:id/comments', async (c) => { const b = await body(c); S.addComment(db, uid(c), Number(c.req.param('id')), String(b.comment ?? ''), (c.get('user') as AuthUser).username); return c.json(S.getTask(db, uid(c), Number(c.req.param('id'))), 201); });
  app.delete('/api/tasks/:id/comments/:cid', (c) => { S.deleteComment(db, uid(c), Number(c.req.param('id')), Number(c.req.param('cid'))); return c.json(S.getTask(db, uid(c), Number(c.req.param('id')))); });

  // ---- import and export ----
  const stamp = () => new Date().toISOString().slice(0, 10);
  const download = (c: any, data: Uint8Array, name: string) => c.body(data, 200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"` });
  app.get('/api/export/standardnotes', (c) => download(c, exportStandardNotes(db, uid(c), c.req.query('plain') === '1'), `turbokeep-standard-notes-${stamp()}${c.req.query('plain') === '1' ? '-plaintext' : ''}.zip`));
  app.get('/api/export/turbokeep', (c) => download(c, exportTurboKeep(db, uid(c)), `turbokeep-${stamp()}.zip`));
  app.get('/api/export/vikunja', (c) => {
    const { zip, droppedRelations } = exportVikunja(db, c.get('user'), { crossProject: c.req.query('relations') === 'all' });
    c.header('X-Dropped-Relations', String(droppedRelations)); // see formats/vikunja.ts: why relations between projects are left out by default
    c.header('Access-Control-Expose-Headers', 'X-Dropped-Relations');
    return download(c, zip, `turbokeep-vikunja-${stamp()}${c.req.query('relations') === 'all' ? '-all-relations' : ''}.zip`);
  });

  async function uploads(c: any): Promise<{ name: string; data: Uint8Array }[]> {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > cfg.maxImportBytes) throw new S.HttpError(413, `Too large: the limit is ${Math.round(cfg.maxImportBytes / 1048576)} MB (TURBOKEEP_MAX_IMPORT_MB)`);
    const form = await c.req.formData().catch(() => { throw new S.HttpError(400, 'Send the file as multipart form data (field "file")'); });
    const out: { name: string; data: Uint8Array }[] = [];
    for (const v of form.getAll('file')) if (typeof v !== 'string') out.push({ name: v.name, data: new Uint8Array(await v.arrayBuffer()) });
    if (!out.length) throw new S.HttpError(400, 'No file in the request');
    if (out.reduce((n, f) => n + f.data.length, 0) > cfg.maxImportBytes) throw new S.HttpError(413, 'Too large');
    return out;
  }
  app.post('/api/import/standardnotes', async (c) => c.json(importStandardNotes(db, uid(c), await uploads(c), c.req.query('dry') === '1')));
  app.post('/api/import/turbokeep', async (c) => c.json(importTurboKeep(db, c.get('user'), (await uploads(c))[0]!.data, c.req.query('dry') === '1')));
  app.post('/api/import/vikunja', async (c) => c.json(importVikunja(db, c.get('user'), (await uploads(c))[0]!.data, c.req.query('dry') === '1')));

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  // ---- the web client ----
  const root = resolve(cfg.webDir);
  app.get('*', (c) => {
    if (!existsSync(join(root, 'index.html'))) return c.text('TurboKeep is running, but the web client is not built here (pnpm build).', 503);
    const rel = normalize(decodeURIComponent(c.req.path)).replace(/^([/\\])+/, '');
    let file = resolve(root, rel);
    const inside = file === root || file.startsWith(root + sep);
    if (!inside || !existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html'); // client-side routes
    const ext = extname(file);
    const headers: Record<string, string> = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' };
    headers['Cache-Control'] = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    return c.body(readFileSync(file), 200, headers);
  });
  return app;
}

/** Fonts and the app are served from this origin; theme updates are fetched from GitHub, so that host is allowed to connect. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://raw.githubusercontent.com https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
