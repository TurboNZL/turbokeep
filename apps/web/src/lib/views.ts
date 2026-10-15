import type { Note, NoteParams } from './api.ts';
import type { SortId } from './settings.ts';

/**
 * What Home shows: the Home list (everything with a checkbox, the default), every live note, the notes without a tag, or one tag (with its sub-tags).
 * A search looks through everything that is not in the bin. The filter lives in the address, so a reload or a shared link shows the same list.
 */
export type Scope = 'list' | 'all' | 'untagged';
export interface HomeFilter { scope: Scope; tag?: string; q?: string }

export const SCOPES: { id: Scope; label: string }[] = [
  { id: 'list', label: 'Tasks' }, { id: 'all', label: 'All notes' }, { id: 'untagged', label: 'No tag' },
];
const isScope = (v: unknown): v is Scope => SCOPES.some((s) => s.id === v);

export function filterFromSearch(sp: URLSearchParams): HomeFilter {
  const s = sp.get('scope');
  return { scope: isScope(s) ? s : 'list', tag: sp.get('tag') || undefined, q: sp.get('q') || undefined };
}

/** `/home/<note>?scope=...&tag=...`: the open note travels with every link, so changing the filter or the page never closes it. */
export function homeLink(noteId: string | null | undefined, f: Partial<HomeFilter> = {}): string {
  const sp = new URLSearchParams();
  if (f.scope && f.scope !== 'list' && !f.tag) sp.set('scope', f.scope);
  if (f.tag) sp.set('tag', f.tag);
  if (f.q) sp.set('q', f.q);
  const qs = sp.toString();
  return `/home${noteId ? `/${noteId}` : ''}${qs ? `?${qs}` : ''}`;
}

/** The API parameters for a filter. The list only needs a preview of each text, so excerpts are asked for. */
export function viewParams(f: HomeFilter): NoteParams {
  const p: NoteParams = { excerpt: '1' };
  if (f.q) { p.view = 'kept'; p.q = f.q; if (f.tag) p.tag = f.tag; return p; }
  if (f.tag) { p.tag = f.tag; return p; }
  if (f.scope === 'list') p.list = '1';
  else if (f.scope === 'untagged') p.untagged = '1';
  return p;
}

export const hasTag = (n: Note, tag: string) => n.tags.some((t) => t === tag || t.startsWith(`${tag}.`));

/** Does a note belong in the list the filter describes? Used to update the list at once after a change, without asking the server again. */
export function matchesFilter(n: Note, f: HomeFilter): boolean {
  if (n.trashed) return false;
  if (f.q) return true; // the server chose these; keep them while they are being changed
  if (n.archived) return false;
  if (f.tag) return hasTag(n, f.tag);
  if (f.scope === 'list') return n.onList;
  if (f.scope === 'untagged') return n.tags.length === 0;
  return true;
}

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
export const canReorder = (sort: SortId, f: HomeFilter) => sort === 'manual' && !f.q;

/** The position a note dropped between two others gets (the server does the same sum and renumbers when the gap is too small). */
export function positionBetween(above?: number, below?: number): number | null {
  if (above !== undefined && below !== undefined) return below - above < 1e-7 ? null : (above + below) / 2;
  if (above !== undefined) return above + 1;
  if (below !== undefined) return below - 1;
  return 0;
}
