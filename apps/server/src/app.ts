import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { deleteCookie, setCookie } from 'hono/cookie';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Config } from './config.ts';
import { type DB, all, get, run } from './db.ts';
import { COOKIE, LoginLimiter, type AuthUser, clientIp, createSession, hashPassword, isHttps, requireAuth, verifyPassword } from './auth.ts';
import * as S from './store.ts';
import { exportStandardNotes, exportTurboKeep, exportVikunja, importStandardNotes, importTurboKeep, importVikunja } from './io.ts';
import { VERSION } from './version.ts';
import type { Updater } from './update.ts';

export { VERSION };
type Env = { Variables: { user: AuthUser } };

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };

const int = (v: string | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : undefined; };
const USERNAME = /^[A-Za-z0-9_.-]{2,40}$/;

export function createApp(db: DB, cfg: Config, setup: { code: string | null } = { code: null }, updater?: Updater) {
  const app = new Hono<Env>();
  const limiter = new LoginLimiter();
  const auth = requireAuth(db, cfg);
  const userCount = () => Number(get(db, 'select count(*) c from users')!.c);

  app.use('*', compress()); // the page, its scripts and the JSON answers, gzip or deflate when the browser accepts it
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Frame-Options', 'DENY');
    if (c.req.path.startsWith('/api/') && !c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store'); // an emoji picture sets its own
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
  // the owner is the first account (the one made with the setup code): only they may update the server
  const isOwner = (id: number) => get(db, 'select min(id) m from users')?.m === id;
  app.get('/api/auth/me', (c) => c.json({ user: { id: c.get('user').id, username: c.get('user').username, owner: isOwner(c.get('user').id) } }));
  app.get('/api/admin/update', (c) => {
    if (!isOwner(c.get('user').id)) throw new S.HttpError(403, 'Only the owner (the first account) can update the server.');
    return c.json({ available: !!updater?.available, restarts: !!updater?.restarts, ...(updater?.state() ?? { status: 'idle', log: [], startedAt: null, restarting: false }) });
  });
  app.post('/api/admin/update', (c) => {
    if (!isOwner(c.get('user').id)) throw new S.HttpError(403, 'Only the owner (the first account) can update the server.');
    if (!updater?.available) throw new S.HttpError(404, 'This server cannot update itself.');
    if (!updater.start()) throw new S.HttpError(409, 'An update is already running.');
    return c.json({ ok: true }, 202);
  });
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

  // ---- notes (one kind of thing: on the Home list or filed under tags) ----
  const uid = (c: any) => (c.get('user') as AuthUser).id;
  const body = async (c: any) => (await c.req.json().catch(() => { throw new S.HttpError(400, 'Invalid JSON'); })) ?? {};
  const bool3 = (v: string | undefined) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1');
  app.get('/api/notes', (c) => {
    const q = c.req.query();
    const list = S.listNotes(db, uid(c), { view: (q.view as any) || 'notes', list: bool3(q.list), tag: q.tag || undefined, untagged: q.untagged === '1', q: q.q || undefined, due: q.due as any });
    // the list only needs a preview of each text (the open note is fetched whole): `excerpt=1` keeps the answer small on a big library
    return c.json(q.excerpt === '1' ? list.map((n) => (n.text.length > 400 ? { ...n, text: n.text.slice(0, 400) } : n)) : list);
  });
  app.post('/api/notes', async (c) => c.json(S.createNote(db, uid(c), await body(c)), 201));
  app.post('/api/notes/empty-trash', (c) => c.json({ deleted: S.emptyTrash(db, uid(c)) }));
  app.get('/api/notes/:id', (c) => c.json(S.getNote(db, uid(c), c.req.param('id'))));
  app.patch('/api/notes/:id', async (c) => { const b = await body(c); return c.json(S.updateNote(db, uid(c), c.req.param('id'), b, typeof b.base === 'string' ? b.base : undefined)); });
  // drag and drop: {above, below} are the notes that should end up directly over and under it
  app.post('/api/notes/:id/move', async (c) => { const b = await body(c); return c.json(S.moveNote(db, uid(c), c.req.param('id'), typeof b.above === 'string' ? b.above : null, typeof b.below === 'string' ? b.below : null)); });
  app.delete('/api/notes/:id', (c) => { S.deleteNote(db, uid(c), c.req.param('id')); return c.json({ ok: true }); });
  // imported emoji: the page shrinks the picture to emoji size and sends it as base64; each one is served with a year-long cache header (its id never changes)
  app.get('/api/emoji', (c) => c.json(S.listEmoji(db, uid(c))));
  app.post('/api/emoji', async (c) => {
    const b = await body(c);
    if (typeof b.data !== 'string') throw new S.HttpError(400, 'Send {name, data} with the picture as base64');
    return c.json(S.addEmoji(db, uid(c), b.name, new Uint8Array(Buffer.from(b.data, 'base64'))), 201);
  });
  app.get('/api/emoji/:id', (c) => {
    const e = S.getEmoji(db, uid(c), c.req.param('id'));
    if (!e) return c.json({ error: 'Emoji not found' }, 404);
    return c.body(e.data as any, 200, { 'Content-Type': e.mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
  });
  app.delete('/api/emoji/:id', (c) => { S.deleteEmoji(db, uid(c), c.req.param('id')); return c.json({ ok: true }); });
  app.get('/api/tags', (c) => c.json(c.req.query('view') === 'all' ? S.listTagsEverywhere(db, uid(c)) : S.listTags(db, uid(c), c.req.query('view') === 'archived' ? 'archived' : 'live', c.req.query('tasks') === '1')));
  // {from, to} renames; {title, emoji, color} sets the tag's look (either may be sent, '' clears)
  app.patch('/api/tags', async (c) => {
    const b = await body(c);
    if (b.from !== undefined) S.renameTag(db, uid(c), String(b.from), String(b.to ?? ''));
    if (b.emoji !== undefined || b.color !== undefined) S.styleTag(db, uid(c), String(b.title ?? b.to ?? b.from ?? ''), b);
    return c.json({ ok: true });
  });
  app.delete('/api/tags', (c) => { S.deleteTag(db, uid(c), c.req.query('title') ?? '', c.req.query('tree') === '1'); return c.json({ ok: true }); });

  // ---- import and export ----
  const stamp = () => new Date().toISOString().slice(0, 10);
  const download = (c: any, data: Uint8Array, name: string) => c.body(data, 200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"` });
  app.get('/api/export/standardnotes', (c) => download(c, exportStandardNotes(db, uid(c), c.req.query('plain') === '1'), `turbokeep-standard-notes-${stamp()}${c.req.query('plain') === '1' ? '-plaintext' : ''}.zip`));
  app.get('/api/export/turbokeep', (c) => download(c, exportTurboKeep(db, uid(c)), `turbokeep-${stamp()}.zip`));
  app.get('/api/export/vikunja', (c) => {
    const { zip, notListed } = exportVikunja(db, c.get('user'));
    c.header('X-Not-Exported', String(notListed)); // notes that are not on the list have no place in Vikunja
    c.header('Access-Control-Expose-Headers', 'X-Not-Exported');
    return download(c, zip, `turbokeep-vikunja-${stamp()}.zip`);
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
