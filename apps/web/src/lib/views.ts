import { Archive, Calendar, CalendarClock, CheckSquare, FileText, Flag, House, Star, Trash2, type LucideIcon } from 'lucide-react';
import type { Note, NoteParams } from './api.ts';
import type { SortId } from './settings.ts';

/**
 * The ways to look at Home. They are buttons in the side bar, top bar or dock (so one tap changes the view), and each one is just a filter of the
 * same list of notes (a task is a note). The first one, Home (id 'inbox', kept so old links work), is everything that is not archived or in the trash.
 */
export type ViewId = 'inbox' | 'today' | 'tasks' | 'notes' | 'week' | 'overdue' | 'starred' | 'archived' | 'trashed';
export interface View { id: ViewId; label: string; icon: LucideIcon; /** has its own button in the phone dock (the rest sit under "More") */ dock: boolean; query: NoteParams }

export const VIEWS: View[] = [
  { id: 'inbox', label: 'Home', icon: House, dock: true, query: {} },
  { id: 'today', label: 'Today', icon: Calendar, dock: true, query: { due: 'today' } },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, dock: true, query: { kind: 'tasks' } },
  { id: 'notes', label: 'Notes', icon: FileText, dock: true, query: { kind: 'notes' } },
  { id: 'week', label: 'Next 7 days', icon: CalendarClock, dock: false, query: { due: 'week' } },
  { id: 'overdue', label: 'Overdue', icon: Flag, dock: false, query: { due: 'overdue' } },
  { id: 'starred', label: 'Starred', icon: Star, dock: false, query: { favorites: '1' } },
  { id: 'archived', label: 'Archive', icon: Archive, dock: false, query: { view: 'archived' } },
  { id: 'trashed', label: 'Trash', icon: Trash2, dock: false, query: { view: 'trashed' } },
];
export const isView = (v: unknown): v is ViewId => VIEWS.some((x) => x.id === v);

export interface HomeFilter { view: ViewId; tag?: string; project?: string; q?: string; showDone?: boolean }

/** The API parameters for a view plus the rail's tag / project and the search box. */
export function viewParams(f: HomeFilter): NoteParams {
  const v = VIEWS.find((x) => x.id === f.view) ?? VIEWS[0]!;
  const p: NoteParams = { ...v.query, excerpt: '1' }; // the list only needs a preview of each text
  if (f.tag) p.tag = f.tag;
  if (f.project) p.project = f.project;
  if (f.q) p.q = f.q;
  // finished tasks are hidden unless asked for (the piles that are not "live" show everything)
  if (!f.showDone && !['archived', 'trashed', 'overdue'].includes(f.view)) p.done = 'false';
  return p;
}

/** `/home/<note>?view=...&tag=...` : the open note travels with every link, so changing the view or the tab never closes it. */
export function homeLink(noteId: string | null | undefined, f: Partial<HomeFilter> & { view?: ViewId } = {}): string {
  const sp = new URLSearchParams();
  if (f.view && f.view !== 'inbox') sp.set('view', f.view);
  if (f.tag) sp.set('tag', f.tag);
  if (f.project) sp.set('project', f.project);
  if (f.q) sp.set('q', f.q);
  if (f.showDone) sp.set('done', '1');
  const qs = sp.toString();
  return `/home${noteId ? `/${noteId}` : ''}${qs ? `?${qs}` : ''}`;
}

/** What Home shows, read from the address (the same on every load, so a reload or a shared link shows the same list). */
export function filterFromSearch(sp: URLSearchParams): HomeFilter {
  const v = sp.get('view');
  return { view: isView(v) ? v : 'inbox', tag: sp.get('tag') || undefined, project: sp.get('project') || undefined, q: sp.get('q') || undefined, showDone: sp.get('done') === '1' };
}

export const SORTS: { id: SortId; label: string }[] = [
  { id: 'auto', label: 'Automatic' }, { id: 'newest', label: 'Newest first' }, { id: 'edited', label: 'Recently edited' }, { id: 'oldest', label: 'Oldest first' }, { id: 'title', label: 'Title A to Z' },
];

/** Orders a list. Pinned notes stay on top. 'auto' is newest first on the Keep wall and the server's own order (due dates for tasks) otherwise. */
export function sortNotes(list: Note[], sort: SortId, keep: boolean): Note[] {
  const how = sort === 'auto' ? (keep ? 'newest' : null) : sort;
  if (!how) return list;
  const key = (n: Note) => (how === 'edited' ? n.updatedAt : n.createdAt);
  const cmp = how === 'title' ? (a: Note, b: Note) => (a.title || a.text).localeCompare(b.title || b.text, undefined, { sensitivity: 'base' })
    : how === 'oldest' ? (a: Note, b: Note) => key(a).localeCompare(key(b)) : (a: Note, b: Note) => key(b).localeCompare(key(a));
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp(a, b));
}
