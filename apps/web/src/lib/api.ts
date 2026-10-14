/** The server's JSON API. Same origin, relative URLs and the session cookie, so it works behind any proxy or Cloudflare tunnel with no setup. */
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

/** What a note list needs to draw a task: the checkbox, a date, a priority. The whole task is `Task` (from GET /api/notes/:id). */
export interface TaskLite {
  id: number; projectId: number; done: boolean; doneAt: string | null; dueDate: string | null; startDate: string | null; endDate: string | null;
  priority: number; percentDone: number; isFavorite: boolean; repeatAfter: number; repeatMode: number;
}
export interface Note { id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean; tags: string[]; createdAt: string; updatedAt: string; task: TaskLite | null }
export interface Project { id: number; title: string; description: string; hexColor: string; parentId: number | null; isArchived: boolean; isFavorite: boolean; isInbox: boolean; position: number; openTasks: number }
export interface Reminder { reminder: string | null; relativePeriod: number; relativeTo: string }
export interface Task {
  id: number; noteId: string; projectId: number; index: number; title: string; description: string; done: boolean; doneAt: string | null; dueDate: string | null; startDate: string | null; endDate: string | null;
  priority: number; percentDone: number; hexColor: string; isFavorite: boolean; position: number; repeatAfter: number; repeatMode: number; createdAt: string; updatedAt: string;
  tags: string[]; reminders: Reminder[]; related: Record<string, { id: number; noteId: string; title: string; projectId: number; done: boolean }[]>;
  comments: { id: number; comment: string; author: string; createdAt: string; updatedAt: string }[]; commentCount: number;
}
/** One note with its whole task (when it has one). */
export type NoteDetail = Omit<Note, 'task'> & { task: Task | null };
export interface NoteParams { view?: string; kind?: string; tag?: string; q?: string; done?: string; due?: string; favorites?: string; project?: string }
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
  note: (id: string) => req<NoteDetail>('GET', `/api/notes/${id}`),
  noteOrNull: (id: string) => req<NoteDetail>('GET', `/api/notes/${id}`).catch(() => null),
  createNote: (n: Partial<Omit<Note, 'task'>>) => req<Note>('POST', '/api/notes', n),
  updateNote: (id: string, n: Partial<Omit<Note, 'task'>> & { base?: string }) => req<Note>('PATCH', `/api/notes/${id}`, n),
  deleteNote: (id: string) => req<unknown>('DELETE', `/api/notes/${id}`),
  emptyTrash: () => req<{ deleted: number }>('POST', '/api/notes/empty-trash'),
  /** make a note a task / change its task / take the task off (the note stays) */
  makeTask: (noteId: string, t: Record<string, unknown> = {}) => req<Task>('PUT', `/api/notes/${noteId}/task`, t),
  patchTask: (noteId: string, t: Record<string, unknown>) => req<Task>('PATCH', `/api/notes/${noteId}/task`, t),
  detachTask: (noteId: string) => req<unknown>('DELETE', `/api/notes/${noteId}/task`),
  tags: () => req<{ title: string; count: number }[]>('GET', '/api/tags'),
  renameTag: (from: string, to: string) => req<unknown>('PATCH', '/api/tags', { from, to }),
  deleteTag: (title: string) => req<unknown>('DELETE', `/api/tags?title=${encodeURIComponent(title)}`),

  projects: () => req<Project[]>('GET', '/api/projects'),
  createProject: (p: Partial<Project>) => req<Project>('POST', '/api/projects', p),
  updateProject: (id: number, p: Partial<Project>) => req<Project>('PATCH', `/api/projects/${id}`, p),
  deleteProject: (id: number) => req<unknown>('DELETE', `/api/projects/${id}`),
  /** a task created straight away (its note is made from the title) */
  createTask: (t: Record<string, unknown>) => req<Task>('POST', '/api/tasks', t),
  tasks: (p: Record<string, string | undefined> = {}) => req<Task[]>('GET', `/api/tasks?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '') as [string, string][])}`),
  addRelation: (id: number, otherId: number, kind: string) => req<Task>('POST', `/api/tasks/${id}/relations`, { otherId, kind }),
  removeRelation: (id: number, otherId: number, kind: string) => req<Task>('DELETE', `/api/tasks/${id}/relations/${otherId}/${kind}`),
  addComment: (id: number, comment: string) => req<Task>('POST', `/api/tasks/${id}/comments`, { comment }),
  deleteComment: (id: number, cid: number) => req<Task>('DELETE', `/api/tasks/${id}/comments/${cid}`),

  importFiles: (kind: 'turbokeep' | 'standardnotes' | 'vikunja', files: File[], dry: boolean) => {
    const f = new FormData();
    for (const file of files) f.append('file', file);
    return req<Report>('POST', `/api/import/${kind}${dry ? '?dry=1' : ''}`, f);
  },
};

/** Saves a file the server generates (the export zips). A plain link would also work, but this reports errors in the page. */
export async function download(path: string, fallbackName: string): Promise<{ dropped: number }> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? `Server said ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  saveBlob(await res.blob(), name);
  return { dropped: Number(res.headers.get('x-dropped-relations') ?? 0) };
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
