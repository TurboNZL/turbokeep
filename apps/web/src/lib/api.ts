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

export interface Note { id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean; tags: string[]; createdAt: string; updatedAt: string }
export interface Project { id: number; title: string; description: string; hexColor: string; parentId: number | null; isArchived: boolean; isFavorite: boolean; isInbox: boolean; position: number; openTasks: number }
export interface Label { id: number; title: string; description: string; hexColor: string }
export interface Reminder { reminder: string | null; relativePeriod: number; relativeTo: string }
export interface Task {
  id: number; projectId: number; index: number; title: string; description: string; done: boolean; doneAt: string | null; dueDate: string | null; startDate: string | null; endDate: string | null;
  priority: number; percentDone: number; hexColor: string; isFavorite: boolean; position: number; repeatAfter: number; repeatMode: number; createdAt: string; updatedAt: string;
  labels: Label[]; reminders: Reminder[]; related: Record<string, { id: number; title: string; projectId: number; done: boolean }[]>;
  comments: { id: number; comment: string; author: string; createdAt: string; updatedAt: string }[]; commentCount: number;
}
export interface Report { warnings: string[]; dry: boolean; [k: string]: number | string[] | boolean }
export interface SetupInfo { needsSetup: boolean; setupCodeRequired: boolean; allowSignup: boolean; version: string }

export const api = {
  setup: () => req<SetupInfo>('GET', '/api/setup'),
  me: () => req<{ user: { id: number; username: string } }>('GET', '/api/auth/me'),
  login: (username: string, password: string) => req<{ user: { id: number; username: string } }>('POST', '/api/auth/login', { username, password }),
  register: (username: string, password: string, setupCode?: string) => req<{ user: { id: number; username: string } }>('POST', '/api/auth/register', { username, password, setupCode }),
  logout: () => req<unknown>('POST', '/api/auth/logout'),
  changePassword: (current: string, next: string) => req<unknown>('POST', '/api/auth/password', { current, next }),
  tokens: () => req<{ id: string; name: string; createdAt: string; lastUsed: string | null }[]>('GET', '/api/tokens'),
  createToken: (name: string) => req<{ token: string }>('POST', '/api/tokens', { name }),
  deleteToken: (id: string) => req<unknown>('DELETE', `/api/tokens/${id}`),

  notes: (p: { view?: string; tag?: string; q?: string } = {}) => req<Note[]>('GET', `/api/notes?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`),
  getNoteSafe: (id: string) => req<Note>('GET', `/api/notes/${id}`).catch(() => null),
  createNote: (n: Partial<Note>) => req<Note>('POST', '/api/notes', n),
  updateNote: (id: string, n: Partial<Note> & { base?: string }) => req<Note>('PATCH', `/api/notes/${id}`, n),
  deleteNote: (id: string) => req<unknown>('DELETE', `/api/notes/${id}`),
  emptyTrash: () => req<{ deleted: number }>('POST', '/api/notes/empty-trash'),
  tags: () => req<{ title: string; count: number }[]>('GET', '/api/tags'),
  renameTag: (from: string, to: string) => req<unknown>('PATCH', '/api/tags', { from, to }),
  deleteTag: (title: string) => req<unknown>('DELETE', `/api/tags?title=${encodeURIComponent(title)}`),

  projects: () => req<Project[]>('GET', '/api/projects'),
  createProject: (p: Partial<Project>) => req<Project>('POST', '/api/projects', p),
  updateProject: (id: number, p: Partial<Project>) => req<Project>('PATCH', `/api/projects/${id}`, p),
  deleteProject: (id: number) => req<unknown>('DELETE', `/api/projects/${id}`),
  labels: () => req<Label[]>('GET', '/api/labels'),
  updateLabel: (id: number, l: Partial<Label>) => req<Label>('PATCH', `/api/labels/${id}`, l),
  deleteLabel: (id: number) => req<unknown>('DELETE', `/api/labels/${id}`),
  tasks: (p: Record<string, string | undefined> = {}) => req<Task[]>('GET', `/api/tasks?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '') as [string, string][])}`),
  task: (id: number) => req<Task>('GET', `/api/tasks/${id}`),
  createTask: (t: Record<string, unknown>) => req<Task>('POST', '/api/tasks', t),
  updateTask: (id: number, t: Record<string, unknown>) => req<Task>('PATCH', `/api/tasks/${id}`, t),
  deleteTask: (id: number) => req<unknown>('DELETE', `/api/tasks/${id}`),
  addRelation: (id: number, otherId: number, kind: string) => req<Task>('POST', `/api/tasks/${id}/relations`, { otherId, kind }),
  removeRelation: (id: number, otherId: number, kind: string) => req<Task>('DELETE', `/api/tasks/${id}/relations/${otherId}/${kind}`),
  addComment: (id: number, comment: string) => req<Task>('POST', `/api/tasks/${id}/comments`, { comment }),
  deleteComment: (id: number, cid: number) => req<Task>('DELETE', `/api/tasks/${id}/comments/${cid}`),

  importFiles: (kind: 'standardnotes' | 'vikunja', files: File[], dry: boolean) => {
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
