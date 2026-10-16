import type { Note, NoteParams } from './api.ts';
import type { CountTasks, SortId } from './settings.ts';

/**
 * What Home (and the Archive, which is organised the same way) shows: the Tasks (everything with a checkbox, the default), every note, what is due soon,
 * or one tag (with its sub-tags). A tag shows only what was sent to tags (a tag on a task does not put the task under it). A search looks through
 * everything that is not in the bin. The filter lives in the address, so a reload or a shared link shows the same list.
 */
export type Scope = 'list' | 'all' | 'due';
export interface HomeFilter { scope: Scope; tag?: string; q?: string }

export const SCOPES: { id: Scope; label: string }[] = [
  { id: 'list', label: 'Tasks' }, { id: 'all', label: 'All notes' }, { id: 'due', label: 'Due soon' },
];
const isScope = (v: unknown): v is Scope => SCOPES.some((s) => s.id === v);

export function filterFromSearch(sp: URLSearchParams): HomeFilter {
  const s = sp.get('scope');
  return { scope: isScope(s) ? s : 'list', tag: sp.get('tag') || undefined, q: sp.get('q') || undefined };
}

/** `/home/<note>?scope=...&tag=...`: the open note travels with every link, so changing the filter or the page never closes it. `base` is the page ('/home' or '/archive'). */
export function homeLink(noteId: string | null | undefined, f: Partial<HomeFilter> = {}, base = '/home'): string {
  const sp = new URLSearchParams();
  if (f.scope && f.scope !== 'list' && !f.tag) sp.set('scope', f.scope);
  if (f.tag) sp.set('tag', f.tag);
  if (f.q) sp.set('q', f.q);
  const qs = sp.toString();
  return `${base}${noteId ? `/${noteId}` : ''}${qs ? `?${qs}` : ''}`;
}

/** The API parameters for a filter (`archive`: the archive's notes instead of the live ones). The list only needs a preview of each text, so excerpts are asked for. */
/** Are tasks that carry a tag counted and listed under it on this page? (Settings > Items > Tasks in tags) */
export const tasksInTags = (mode: CountTasks, archive: boolean) => mode === 'both' || (mode === 'home' && !archive) || (mode === 'archive' && archive);

export function viewParams(f: HomeFilter, archive = false, withTasks = false): NoteParams {
  const p: NoteParams = { excerpt: '1' };
  if (archive) p.view = 'archived';
  if (f.q) { p.q = f.q; if (f.tag) { p.tag = f.tag; if (!withTasks) p.list = '0'; } return p; } // a search looks through the page you are on (the others are offered when they hold results)
  if (f.tag) { p.tag = f.tag; if (!withTasks) p.list = '0'; return p; }
  if (f.scope === 'list') p.list = '1';
  else if (f.scope === 'due') p.due = 'any';
  return p;
}

export const hasTag = (n: Note, tag: string) => n.tags.some((t) => t === tag || t.startsWith(`${tag}.`));

/** Does a note belong in the list the filter describes? Used to update the list at once after a change, without asking the server again. */
export function matchesFilter(n: Note, f: HomeFilter, archive = false, withTasks = false): boolean {
  if (n.trashed) return false;
  if (n.archived !== archive) return false;
  if (f.q) return !f.tag || (hasTag(n, f.tag) && (withTasks || !n.onList)); // the server chose these; keep them while they are being changed
  if (f.tag) return hasTag(n, f.tag) && (withTasks || !n.onList);
  if (f.scope === 'list') return n.onList;
  if (f.scope === 'due') return !!n.dueDate;
  return true;
}

/** How many items "Due soon" holds at least, before it grows to the end of the time frame the last one falls in. */
export const DUE_SOON_COUNT = 5;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addMonths = (d: Date, m: number) => { const x = new Date(d.getFullYear(), d.getMonth() + m, d.getDate()); return x.getDate() === d.getDate() ? x : new Date(d.getFullYear(), d.getMonth() + m + 1, 0); };

/**
 * "Due soon": what is overdue, then the five that are due next. Time frames are 1 day, 1 week, 1 month and 3 months from today; when the fifth falls inside a
 * frame, everything else due before that frame ends is kept with it (the fifth in 3 days and another in 5 days: both stay, up to the end of the week).
 * Fewer than five coming up: all of them. A fifth beyond 3 months keeps just the ones due by its day. Overdue ones are shown first and do not use up the five.
 */
export function dueSoon(list: Note[], now = new Date()): Note[] {
  const today = startOfDay(now).getTime();
  const day = (n: Note) => startOfDay(new Date(n.dueDate!)).getTime();
  const byDue = (a: Note, b: Note) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime() || compareManual(a, b);
  const dated = list.filter((n) => n.dueDate).sort(byDue);
  const overdue = dated.filter((n) => day(n) < today), coming = dated.filter((n) => day(n) >= today);
  if (coming.length <= DUE_SOON_COUNT) return [...overdue, ...coming];
  const start = startOfDay(now), last = day(coming[DUE_SOON_COUNT - 1]!);
  const frames = [new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1), new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7), addMonths(start, 1), addMonths(start, 3)];
  const end = frames.map((f) => f.getTime()).find((f) => last <= f) ?? last;
  return [...overdue, ...coming.filter((n) => day(n) <= end)];
}

/** Each page and tab remembers its own order: the key says which one (a tag, a scope, the archive's own, a search). */
export const sortKey = (f: HomeFilter, archive: boolean) => `${archive ? 'archive:' : ''}${f.q ? 'search' : f.tag ? `tag:${f.tag}` : f.scope}`;

export const SORTS: { id: SortId; label: string }[] = [
  { id: 'manual', label: 'My order (drag)' }, { id: 'newest', label: 'Newest first' }, { id: 'edited', label: 'Recently edited' }, { id: 'oldest', label: 'Oldest first' },
  { id: 'due', label: 'Due date' }, { id: 'title', label: 'Title A to Z' },
];

/** The order the server uses for "my order": pinned first, then the hand-made position, then the latest edit. */
export const compareManual = (a: Note, b: Note) => Number(b.pinned) - Number(a.pinned) || a.position - b.position || b.updatedAt.localeCompare(a.updatedAt);

/** Orders a list. Pinned notes stay on top in every order. */
export function sortNotes(list: Note[], sort: SortId): Note[] {
  const by: Record<SortId, (a: Note, b: Note) => number> = {
    manual: compareManual,
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    edited: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    title: (a, b) => (a.title || a.text).localeCompare(b.title || b.text, undefined, { sensitivity: 'base' }),
    due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  };
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || by[sort](a, b));
}

/** Dragging only makes sense while the list is in your own order and shows one whole pile (not search results). */
export const canReorder = (sort: SortId, f: HomeFilter) => sort === 'manual' && !f.q && f.scope !== 'due';

/** The position a note dropped between two others gets (the server does the same sum and renumbers when the gap is too small). */
export function positionBetween(above?: number, below?: number): number | null {
  if (above !== undefined && below !== undefined) return below - above < 1e-7 ? null : (above + below) / 2;
  if (above !== undefined) return above + 1;
  if (below !== undefined) return below - 1;
  return 0;
}
