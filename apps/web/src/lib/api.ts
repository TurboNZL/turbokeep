/** The server's JSON API. Same origin, relative URLs and the session cookie, so it works behind any proxy or Cloudflare tunnel with no setup. */
import { android, saveWithApp } from './native.ts';
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  } catch { throw new ApiError(0, 'Cannot reach the server'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Server said ${res.status}`, data);
  return data as T;
}

/**
 * Everything is a note. `onList`: it has a checkbox and shows on Home. Finishing it archives it (`archived` is "done"). `position` is the hand-made order.
 */
export interface Note {
  id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean;
  onList: boolean; dueDate: string | null; percentDone: number; position: number; tags: string[]; createdAt: string; updatedAt: string;
}
export type NotePatch = Partial<Pick<Note, 'title' | 'text' | 'noteType' | 'pinned' | 'archived' | 'trashed' | 'onList' | 'dueDate' | 'percentDone' | 'tags'>> & { base?: string };
export interface TagInfo { title: string; emoji: string; color: string; count: number }
export interface NoteParams { excerpt?: string; view?: string; list?: string; tag?: string; untagged?: string; q?: string; due?: string }
export interface Report { warnings: string[]; dry: boolean; [k: string]: number | string[] | boolean }
export interface ServerUpdate { available: boolean; restarts: boolean; status: 'idle' | 'running' | 'done' | 'error'; log: string[]; startedAt: number | null; restarting: boolean }
export interface SetupInfo { needsSetup: boolean; setupCodeRequired: boolean; allowSignup: boolean; version: string }

export const api = {
  setup: () => req<SetupInfo>('GET', '/api/setup'),
  me: () => req<{ user: { id: number; username: string } }>('GET', '/api/auth/me'),
  login: (username: string, password: string) => req<{ user: { id: number; username: string } }>('POST', '/api/auth/login', { username, password }),
  register: (username: string, password: string, setupCode?: string) => req<{ user: { id: number; username: string } }>('POST', '/api/auth/register', { username, password, setupCode }),
  updateInfo: () => req<ServerUpdate>('GET', '/api/admin/update'),
  startUpdate: () => req<unknown>('POST', '/api/admin/update'),
  logout: () => req<unknown>('POST', '/api/auth/logout'),
  changePassword: (current: string, next: string) => req<unknown>('POST', '/api/auth/password', { current, next }),
  tokens: () => req<{ id: string; name: string; createdAt: string; lastUsed: string | null }[]>('GET', '/api/tokens'),
  createToken: (name: string) => req<{ token: string }>('POST', '/api/tokens', { name }),
  deleteToken: (id: string) => req<unknown>('DELETE', `/api/tokens/${id}`),

  notes: (p: NoteParams = {}) => req<Note[]>('GET', `/api/notes?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`),
  note: (id: string) => req<Note>('GET', `/api/notes/${id}`),
  noteOrNull: (id: string) => req<Note>('GET', `/api/notes/${id}`).catch(() => null),
  createNote: (n: Partial<Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'position'>>) => req<Note>('POST', '/api/notes', n),
  updateNote: (id: string, n: NotePatch) => req<Note>('PATCH', `/api/notes/${id}`, n),
  /** drag and drop: the notes that should end up directly above and below this one */
  moveNote: (id: string, above: string | null, below: string | null) => req<Note>('POST', `/api/notes/${id}/move`, { above, below }),
  deleteNote: (id: string) => req<unknown>('DELETE', `/api/notes/${id}`),
  emptyTrash: () => req<{ deleted: number }>('POST', '/api/notes/empty-trash'),
  tags: () => req<TagInfo[]>('GET', '/api/tags'),
  styleTag: (title: string, look: { emoji?: string; color?: string }) => req<unknown>('PATCH', '/api/tags', { title, ...look }),
  renameTag: (from: string, to: string) => req<unknown>('PATCH', '/api/tags', { from, to }),
  deleteTag: (title: string) => req<unknown>('DELETE', `/api/tags?title=${encodeURIComponent(title)}`),

  importFiles: (kind: 'turbokeep' | 'standardnotes' | 'vikunja', files: File[], dry: boolean) => {
    const f = new FormData();
    for (const file of files) f.append('file', file);
    return req<Report>('POST', `/api/import/${kind}${dry ? '?dry=1' : ''}`, f);
  },
};

/** Saves a file the server generates (the export zips). A plain link would also work, but this reports errors in the page. */
export async function download(path: string, fallbackName: string): Promise<{ notExported: number }> {
  const res = await fetch(path, { credentials: 'same-origin' });
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
