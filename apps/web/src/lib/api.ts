/**
 * The server's JSON API. In a browser: same origin, relative URLs and the session cookie, so it works behind any proxy or Cloudflare tunnel with no setup.
 * In the Android app the page is bundled (http://localhost) and the server is another origin: its address in front, a bearer token and, behind Cloudflare
 * Access, the service token on every request (the same arrangement as TurboMusic's app).
 */
import { android, appHeaders, giveToken, saveWithApp, serverUrl } from './native.ts';
import { earlyMe } from './early.ts';
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

/** notes the page is making right now (see createNoteNow) */
const makes = new Map<string, { shown: Note; done: Promise<void>; result: Promise<Note> }>();
/** the `updatedAt` the page made up for such a note -> the one the server gave it, until the first save carries the real one */
const swaps = new Map<string, { from: string; to: string }>();
const created = (id: string) => makes.get(id)?.done ?? Promise.resolve();

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(serverUrl(path), { method, credentials: android() ? 'omit' : 'same-origin', headers: { ...appHeaders(), ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the server');
  }
  const text = await res.text().catch(() => '');
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON: handled below */ }
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get('location');
    throw new ApiError(res.status, `The request was redirected${to ? ` to ${to.slice(0, 80)}` : ''} instead of answered. Behind Cloudflare Access that is its sign-in page: the service token was not accepted for this request.`);
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Server said ${res.status}`, data);
  // a success that is not JSON is not TurboKeep (Cloudflare Access's sign-in page, a proxy's error page, an empty answer): never hand a null to the screens
  if (data === null && res.status !== 204) throw new ApiError(res.status, `The address answered, but not like TurboKeep (HTTP ${res.status}, ${res.headers.get('content-type') ?? 'no type'}${text ? `: "${text.replace(/\s+/g, ' ').slice(0, 60)}"` : ', empty'}). Behind Cloudflare Access this is usually its sign-in page: check the service token and that its policy has the action Service Auth.`);
  return data as T;
}

/**
 * Everything is a note. `onList`: it has a checkbox and shows on Home. Finishing it archives it (`archived` is "done"). `position` is the hand-made order.
 */
export interface Note {
  id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean;
  onList: boolean; dueDate: string | null; percentDone: number; position: number; tags: string[]; createdAt: string; updatedAt: string;
  /** the title is the date the app put there: shown only in the editor, lists show the text instead */
  autoTitle: boolean;
}
export type NotePatch = Partial<Pick<Note, 'title' | 'text' | 'noteType' | 'pinned' | 'archived' | 'trashed' | 'onList' | 'dueDate' | 'percentDone' | 'tags' | 'autoTitle'>> & { base?: string };
export interface TagCounts { title: string; emoji: string; color: string; notes: number; tasks: number; archived: number; trashed: number; keepTasks?: boolean; retired?: boolean }
export interface TagInfo { title: string; emoji: string; color: string; count: number; /** archived tasks carrying this tag stay tasks (they are sent to their tags otherwise) */ keepTasks?: boolean; /** not offered when adding tags to a note (its notes keep it) */ retired?: boolean }
export interface NoteParams { excerpt?: string; view?: string; list?: string; tag?: string; untagged?: string; q?: string; due?: string }
export interface Report { warnings: string[]; dry: boolean; [k: string]: number | string[] | boolean }
export interface ServerUpdate { available: boolean; restarts: boolean; status: 'idle' | 'running' | 'done' | 'error'; log: string[]; startedAt: number | null; restarting: boolean }
export interface SetupInfo { needsSetup: boolean; setupCodeRequired: boolean; allowSignup: boolean; version: string }

type SignedIn = { user: { id: number; username: string }; token?: string };
const deviceName = () => (android() ? { device: 'Android app' } : {});
async function signedIn(p: Promise<SignedIn>): Promise<{ user: { id: number; username: string } }> {
  const r = await p;
  if (r.token) giveToken(r.token);
  return { user: r.user };
}

export const api = {
  setup: () => req<SetupInfo>('GET', '/api/setup'),
  me: () => earlyMe<{ user: { id: number; username: string } }>() ?? req<{ user: { id: number; username: string } }>('GET', '/api/auth/me'),
  // inside the app the cookie of the server never reaches the page, so signing in asks for a token (`device`) and hands it to the app, which the widget uses too
  login: (username: string, password: string) => signedIn(req<SignedIn>('POST', '/api/auth/login', { username, password, ...deviceName() })),
  register: (username: string, password: string, setupCode?: string) => signedIn(req<SignedIn>('POST', '/api/auth/register', { username, password, setupCode, ...deviceName() })),
  updateInfo: () => req<ServerUpdate>('GET', '/api/admin/update'),
  startUpdate: () => req<unknown>('POST', '/api/admin/update'),
  logout: async () => { try { return await req<unknown>('POST', '/api/auth/logout'); } finally { if (android()) giveToken(''); } },
  changePassword: (current: string, next: string) => req<unknown>('POST', '/api/auth/password', { current, next }),
  tokens: () => req<{ id: string; name: string; createdAt: string; lastUsed: string | null }[]>('GET', '/api/tokens'),
  createToken: (name: string) => req<{ token: string }>('POST', '/api/tokens', { name }),
  deleteToken: (id: string) => req<unknown>('DELETE', `/api/tokens/${id}`),

  notes: (p: NoteParams = {}) => req<Note[]>('GET', `/api/notes?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`),
  note: async (id: string) => { await created(id); return req<Note>('GET', `/api/notes/${id}`); },
  noteOrNull: async (id: string) => { await created(id); return req<Note>('GET', `/api/notes/${id}`).catch(() => null); },
  createNote: (n: Partial<Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'position'>> & { id?: string }) => req<Note>('POST', '/api/notes', n),
  /** make a note whose editor is already open: the page chose the id and the note it shows (`shown`); anything sent for that id waits for the server to have it */
  createNoteNow: (shown: Note) => {
    const p = req<Note>('POST', '/api/notes', { id: shown.id, title: shown.title, text: shown.text, tags: shown.tags, onList: shown.onList, noteType: shown.noteType });
    makes.set(shown.id, { shown, done: p.then(() => undefined, () => undefined), result: p });
    void p.then((made) => { swaps.set(shown.id, { from: shown.updatedAt, to: made.updatedAt }); makes.delete(shown.id); }, () => makes.delete(shown.id));
    return p;
  },
  updateNote: async (id: string, n: NotePatch) => {
    const m = makes.get(id);
    if (m) await m.result.catch(() => undefined);
    // the editor's copy of `updatedAt` is the one the page made up: swap in the server's (also after the note has been made)
    const sw = swaps.get(id);
    if (sw && n.base === sw.from) n = { ...n, base: sw.to };
    return req<Note>('PATCH', `/api/notes/${id}`, n);
  },
  /** drag and drop: the notes that should end up directly above and below this one */
  moveNote: async (id: string, above: string | null, below: string | null) => { await created(id); return req<Note>('POST', `/api/notes/${id}/move`, { above, below }); },
  deleteNote: (id: string) => req<unknown>('DELETE', `/api/notes/${id}`),
  emptyTrash: () => req<{ deleted: number }>('POST', '/api/notes/empty-trash'),
  tags: (pile: 'live' | 'archived' = 'live', withTasks = false) => req<TagInfo[]>('GET', `/api/tags?${pile === 'archived' ? 'view=archived&' : ''}${withTasks ? 'tasks=1' : ''}`.replace(/[?&]$/, '')),
  emoji: () => req<{ id: string; name: string }[]>('GET', '/api/emoji'),
  addEmoji: (name: string, data: string) => req<{ id: string; name: string }>('POST', '/api/emoji', { name, data }),
  deleteEmoji: (id: string) => req<unknown>('DELETE', `/api/emoji/${id}`),
  styleTag: (title: string, look: { emoji?: string; color?: string; keepTasks?: boolean; retired?: boolean }) => req<unknown>('PATCH', '/api/tags', { title, ...look }),
  renameTag: (from: string, to: string) => req<unknown>('PATCH', '/api/tags', { from, to }),
  deleteTag: (title: string, tree = false) => req<unknown>('DELETE', `/api/tags?title=${encodeURIComponent(title)}${tree ? '&tree=1' : ''}`),
  /** every tag wherever its notes are (the tag manager) */
  tagsEverywhere: () => req<TagCounts[]>('GET', '/api/tags?view=all'),

  importFiles: (kind: 'turbokeep' | 'standardnotes' | 'vikunja', files: File[], dry: boolean) => {
    const f = new FormData();
    for (const file of files) f.append('file', file);
    return req<Report>('POST', `/api/import/${kind}${dry ? '?dry=1' : ''}`, f);
  },
};

/** Saves a file the server generates (the export zips). A plain link would also work, but this reports errors in the page. */
export async function download(path: string, fallbackName: string): Promise<{ notExported: number }> {
  const res = await fetch(serverUrl(path), { credentials: android() ? 'omit' : 'same-origin', headers: appHeaders() });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? `Server said ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  saveBlob(await res.blob(), name);
  return { notExported: Number(res.headers.get('x-not-exported') ?? 0) };
}
export function saveBlob(blob: Blob, name: string) {
  if (android()) { void saveWithApp(blob, name); return; }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
