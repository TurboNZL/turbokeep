import { api, type Note, type TagInfo } from './api.ts';
import { filterFromSearch, viewParams } from './views.ts';
import { early } from './early.ts';

/**
 * Starts the requests Home needs at the same moment as the "who am I" check, instead of after it (and after the page code): on a slow link that is
 * two round trips saved. main.tsx calls start() before React renders; Home and the store take what is ready, once, and fall back to asking again.
 * A 401 just means nobody is signed in: the answers are thrown away and the sign-in page shows.
 */
interface Prefetched { key: string; notes: Promise<Note[]>; tags: Promise<TagInfo[]> }
let held: Prefetched | null = null;

export const notesKey = (params: object) => JSON.stringify(params);

/** the plain Home list, as index.html asks for it */
const DEFAULT_NOTES = JSON.stringify({ excerpt: '1', list: '1' });

export function startPrefetch() {
  if (!/^\/(home|$)/.test(location.pathname)) return;
  const params = viewParams(filterFromSearch(new URLSearchParams(location.search)));
  const e = early();
  const p: Prefetched = { key: notesKey(params), notes: (notesKey(params) === DEFAULT_NOTES && (e?.notes as Promise<Note[]> | undefined)) || api.notes(params), tags: (e?.tags as Promise<TagInfo[]> | undefined) || api.tags() };
  for (const x of [p.notes, p.tags]) x.catch(() => {});
  held = p;
}
export function takeNotes(params: object): Promise<Note[]> | null {
  if (!held || held.key !== notesKey(params)) return null;
  const n = held.notes; held = { ...held, key: '' }; return n;
}
export function takeMeta(): Promise<TagInfo[]> | null {
  if (!held) return null;
  const m = held.tags; held = null; return m;
}
