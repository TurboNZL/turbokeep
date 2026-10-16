import { randomBytes, randomUUID } from 'node:crypto';
import { type DB, type Row, all, get, run, tx, now } from './db.ts';

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 429, message: string, public extra?: object) { super(message); }
}

const bool = (v: unknown) => !!v;
const dateOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (Number.isNaN(t)) throw new HttpError(400, 'Invalid date');
  return new Date(t).toISOString();
};
const clamp = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));

// ---------------- users ----------------

export function createUser(db: DB, username: string, passwordHash: string): number {
  return Number(run(db, 'insert into users (username, password_hash, created_at) values (?,?,?)', username, passwordHash, now()).lastInsertRowid);
}

// ---------------- notes: the one kind of thing ----------------

/**
 * Everything is a note. A note is "on the list" (`onList`) when it has a checkbox and shows on Home; finishing it archives it (so "done" and
 * "archived" are one idea); a note that is filed under tags and taken off the list is what other apps call a note. `position` is the hand-made order.
 */
export interface NoteDto {
  id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean;
  onList: boolean; dueDate: string | null; percentDone: number; position: number; tags: string[]; createdAt: string; updatedAt: string;
  /** the title is the date the app put there (the note was typed long), not something you wrote: lists hide it and show the text */
  autoTitle: boolean;
}

const noteDto = (r: Row, tags: string[]): NoteDto => ({
  id: r.id, title: r.title, text: r.text, noteType: r.note_type, pinned: bool(r.pinned), archived: bool(r.archived), trashed: bool(r.trashed),
  onList: bool(r.on_list), dueDate: r.due_date, percentDone: r.percent_done, position: r.position, tags, createdAt: r.created_at, updatedAt: r.updated_at, autoTitle: bool(r.auto_title),
});

function tagMap(db: DB, userId: number): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of all(db, 'select nt.note_id, t.title from note_tags nt join tags t on t.id = nt.tag_id where t.user_id = ? order by nt.position, t.title', userId)) {
    (m.get(r.note_id) ?? m.set(r.note_id, []).get(r.note_id)!).push(r.title);
  }
  return m;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** "2019", "2019-06" or "2019-06-14" as the first and last day it covers, or null when it is not a date. */
export function dateRange(text: string): { from: string; to: string } | null {
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 0, d = m[3] ? Number(m[3]) : 0, last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (mo && (mo < 1 || mo > 12)) return null;
  if (d && (d < 1 || d > last(y, mo))) return null;
  if (!mo) return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (!d) return { from: `${y}-${pad2(mo)}-01`, to: `${y}-${pad2(mo)}-${pad2(last(y, mo))}` };
  return { from: `${y}-${pad2(mo)}-${pad2(d)}`, to: `${y}-${pad2(mo)}-${pad2(d)}` };
}

export interface Search { words: string[]; tags: string[]; notTags: string[]; before: { from: string; to: string }[]; after: { from: string; to: string }[]; is: string[]; notIs: string[]; has: string[]; notHas: string[] }
/**
 * The search language, in the style of Discord's: words, `"a phrase"`, and filters `tag:work` (also finds `work.reports`), `-tag:old` (leaves them out),
 * (`exclude:work` and `include:work` mean the same as `-tag:work` and `tag:work`), `before:2019-06` / `after:2020` (when the note was made; a year or a month is the whole period), `is:task|note|pinned|markdown`, `has:date|tags|text`.
 * A `-` in front of any filter turns it round. Filters combine with AND, so `tag:a tag:b` finds notes with both. A filter that makes no sense is read as a word.
 */
export function parseSearch(q: string): Search {
  const out: Search = { words: [], tags: [], notTags: [], before: [], after: [], is: [], notIs: [], has: [], notHas: [] };
  const re = /(-?)(tags?|includes?|excludes?|not|before|after|is|has):(?:"([^"]*)"|(\S+))|"([^"]+)"|(\S+)/gi;
  for (const m of q.matchAll(re)) {
    if (m[2]) {
      let key = m[2].toLowerCase(), neg = m[1] === '-';
      const val = (m[3] ?? m[4] ?? '').trim();
      if (!val) continue;
      if (key === 'exclude' || key === 'excludes' || key === 'not') { key = 'tag'; neg = !neg; } else if (key === 'include' || key === 'includes' || key === 'tags') key = 'tag';
      if (key === 'tag') (neg ? out.notTags : out.tags).push(val);
      else if (key === 'is') (neg ? out.notIs : out.is).push(val.toLowerCase());
      else if (key === 'has') (neg ? out.notHas : out.has).push(val.toLowerCase());
      else { const r = dateRange(val); if (r) (key === 'before' ? out.before : out.after).push(r); else out.words.push(m[0]); }
    } else out.words.push(m[5] ?? m[6] ?? '');
  }
  out.words = out.words.filter(Boolean).slice(0, 8);
  return out;
}

export interface NoteQuery {
  /** which pile: live notes (default), archived (= finished), trash, kept (live and archived: what a search looks through), or everything */
  view?: 'notes' | 'archived' | 'trashed' | 'kept' | 'all';
  /** true: only what is on the Home list (has a checkbox); false: only what is not */
  list?: boolean;
  tag?: string; untagged?: boolean; q?: string;
  due?: 'today' | 'overdue' | 'week' | 'none' | 'any';
}

export function listNotes(db: DB, userId: number, f: NoteQuery = {}): NoteDto[] {
  const where = ['n.user_id = ?'];
  const args: any[] = [userId];
  const view = f.view ?? 'notes';
  if (view === 'notes') where.push('n.archived = 0 and n.trashed = 0');
  else if (view === 'archived') where.push('n.archived = 1 and n.trashed = 0');
  else if (view === 'trashed') where.push('n.trashed = 1');
  else if (view === 'kept') where.push('n.trashed = 0');
  if (f.list === true) where.push('n.on_list = 1');
  else if (f.list === false) where.push('n.on_list = 0');
  if (f.tag) { where.push('exists (select 1 from note_tags nt join tags g on g.id = nt.tag_id where nt.note_id = n.id and (g.title = ? or g.title like ?))'); args.push(f.tag, `${f.tag}.%`); }
  if (f.untagged) where.push('not exists (select 1 from note_tags nt where nt.note_id = n.id)');
  if (f.q?.trim()) {
    const q = parseSearch(f.q);
    for (const word of q.words) {
      where.push("(n.title like ? escape '\\' or n.text like ? escape '\\')");
      const like = `%${word.replace(/[\\%_]/g, '\\$&')}%`;
      args.push(like, like);
    }
    for (const [list, not] of [[q.tags, false], [q.notTags, true]] as const) for (const t of list) {
      where.push(`${not ? 'not ' : ''}exists (select 1 from note_tags nt join tags g on g.id = nt.tag_id where nt.note_id = n.id and (lower(g.title) = ? or lower(g.title) like ? escape '\\'))`);
      args.push(t.toLowerCase(), `${t.toLowerCase().replace(/[\\%_]/g, '\\$&')}.%`);
    }
    for (const r of q.before) { where.push('substr(n.created_at, 1, 10) < ?'); args.push(r.from); }
    for (const r of q.after) { where.push('substr(n.created_at, 1, 10) > ?'); args.push(r.to); }
    for (const [list, not] of [[q.is, false], [q.notIs, true]] as const) for (const v of list) {
      const cond = v === 'task' ? 'n.on_list = 1' : v === 'note' ? 'n.on_list = 0' : v === 'pinned' ? 'n.pinned = 1' : v === 'markdown' ? "n.note_type = 'markdown'" : null;
      if (cond) where.push(not ? `not (${cond})` : cond);
    }
    for (const [list, not] of [[q.has, false], [q.notHas, true]] as const) for (const v of list) {
      const cond = v === 'date' ? 'n.due_date is not null' : v === 'tags' ? 'exists (select 1 from note_tags nt where nt.note_id = n.id)' : v === 'text' ? "n.text <> ''" : null;
      if (cond) where.push(not ? `not (${cond})` : cond);
    }
  }
  const d = new Date(), startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400_000), endOfWeek = new Date(startOfDay.getTime() + 7 * 86400_000);
  if (f.due === 'today') { where.push('n.due_date >= ? and n.due_date < ?'); args.push(startOfDay.toISOString(), endOfDay.toISOString()); }
  else if (f.due === 'overdue') { where.push('n.due_date < ? and n.archived = 0'); args.push(startOfDay.toISOString()); }
  else if (f.due === 'week') { where.push('n.due_date >= ? and n.due_date < ?'); args.push(startOfDay.toISOString(), endOfWeek.toISOString()); }
  else if (f.due === 'none') where.push('n.due_date is null');
  else if (f.due === 'any') where.push('n.due_date is not null');
  // your hand-made order (pinned first), in the archive too (it is organised like Home); the bin shows what was touched last
  const order = view === 'trashed' ? 'n.updated_at desc' : 'n.pinned desc, n.position, n.updated_at desc';
  const rows = all(db, `select n.* from notes n where ${where.join(' and ')} order by ${order}`, ...args);
  const tags = tagMap(db, userId);
  return rows.map((r) => noteDto(r, tags.get(r.id) ?? []));
}

export function getNote(db: DB, userId: number, id: string): NoteDto {
  const r = get(db, 'select * from notes where id = ? and user_id = ?', id, userId);
  if (!r) throw new HttpError(404, 'Note not found');
  return noteDto(r, tagTitles(db, id));
}
const tagTitles = (db: DB, noteId: string) => all(db, 'select t.title from note_tags nt join tags t on t.id = nt.tag_id where nt.note_id = ? order by nt.position, t.title', noteId).map((r) => r.title as string);

function ensureTag(db: DB, userId: number, title: string): string {
  const r = get(db, 'select id from tags where user_id = ? and title = ?', userId, title);
  if (r) return r.id;
  const id = randomUUID(), t = now();
  run(db, 'insert into tags (id, user_id, title, created_at) values (?,?,?,?)', id, userId, title, t);
  return id;
}
const cleanTag = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);

/** a tag nothing carries, and no sub-tag of it carries either, is deleted (its look with it); a parent such as `work` stays while `work.reports` has notes */
const dropUnusedTags = (db: DB, userId: number) => run(db, `delete from tags where user_id = ? and id not in (select tag_id from note_tags)
  and not exists (select 1 from tags c where c.user_id = tags.user_id and substr(c.title, 1, length(tags.title) + 1) = tags.title || '.' and c.id in (select tag_id from note_tags))`, userId);

function setNoteTags(db: DB, userId: number, noteId: string, tags: unknown) {
  const titles = [...new Set((Array.isArray(tags) ? tags : []).map(cleanTag).filter(Boolean))];
  run(db, 'delete from note_tags where note_id = ?', noteId);
  titles.forEach((t, i) => run(db, 'insert or ignore into note_tags (note_id, tag_id, position) values (?,?,?)', noteId, ensureTag(db, userId, t), i));
  dropUnusedTags(db, userId);
}

export interface NoteInput {
  title?: string; text?: string; noteType?: string; pinned?: boolean; archived?: boolean; trashed?: boolean; tags?: string[];
  onList?: boolean; dueDate?: string | null; percentDone?: number; position?: number; autoTitle?: boolean;
}

/** A new note goes to the top of the hand-made order unless it says where it belongs (imports do). */
const topPosition = (db: DB, userId: number) => Number(get(db, 'select coalesce(min(position), 1) m from notes where user_id = ?', userId)!.m) - 1;

export function createNote(db: DB, userId: number, i: NoteInput, keep?: { id?: string; createdAt?: string; updatedAt?: string }): NoteDto {
  return tx(db, () => {
    const id = keep?.id ?? randomUUID(), t = now();
    run(db, 'insert into notes (id, user_id, title, text, note_type, pinned, archived, trashed, on_list, due_date, percent_done, position, created_at, updated_at, auto_title) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, userId, String(i.title ?? '').slice(0, 1000), String(i.text ?? ''), i.noteType || 'plain-text', +!!i.pinned, +!!i.archived, +!!i.trashed, +!!i.onList, dateOrNull(i.dueDate),
      clamp(i.percentDone, 0, 1), i.position === undefined || !Number.isFinite(Number(i.position)) ? topPosition(db, userId) : Number(i.position), keep?.createdAt ?? t, keep?.updatedAt ?? t, +!!i.autoTitle);
    setNoteTags(db, userId, id, i.tags);
    return getNote(db, userId, id);
  });
}

/**
 * Changes a note. `base` is the updatedAt the editor last saw: when the TEXT is being changed and the note has moved on since (another device),
 * nothing is overwritten and the current note comes back. Only a change to the title, the text or the kind of text moves `updatedAt`; pinning,
 * finishing, tagging, ordering and the like do not, so the list can do them while the same note is being typed in.
 */
export function updateNote(db: DB, userId: number, id: string, i: NoteInput, base?: string): NoteDto {
  return tx(db, () => {
    const cur = get(db, 'select * from notes where id = ? and user_id = ?', id, userId);
    if (!cur) throw new HttpError(404, 'Note not found');
    const content = i.title !== undefined || i.text !== undefined || (i.noteType !== undefined && i.noteType !== cur.note_type);
    if (content && base && base !== cur.updated_at) throw new HttpError(409, 'This note was changed somewhere else', { note: getNote(db, userId, id) });
    const next = {
      title: i.title === undefined ? cur.title : String(i.title).slice(0, 1000), text: i.text === undefined ? cur.text : String(i.text),
      note_type: i.noteType || cur.note_type, pinned: i.pinned === undefined ? cur.pinned : +!!i.pinned,
      archived: i.archived === undefined ? cur.archived : +!!i.archived, trashed: i.trashed === undefined ? cur.trashed : +!!i.trashed,
      on_list: i.onList === undefined ? cur.on_list : +!!i.onList, due_date: i.dueDate === undefined ? cur.due_date : dateOrNull(i.dueDate),
      percent_done: i.percentDone === undefined ? cur.percent_done : clamp(i.percentDone, 0, 1), position: i.position === undefined ? cur.position : Number(i.position) || 0,
      // typing a title of your own ends the app's: it stays an app title only while the title is left as it was (or the page says so)
      auto_title: i.autoTitle !== undefined ? +!!i.autoTitle : i.title !== undefined && String(i.title).slice(0, 1000) !== cur.title ? 0 : cur.auto_title,
    };
    // archiving a task that has tags sends it to them (it becomes a note under its tags), unless one of its tags says its tasks stay tasks
    if (next.archived === 1 && cur.archived === 0 && next.on_list === 1) {
      const titles = i.tags ? i.tags.map(cleanTag).filter(Boolean) : tagTitles(db, id);
      if (titles.length && !titles.some((t) => get(db, 'select 1 x from tags where user_id = ? and title = ? and keep_tasks = 1', userId, t))) next.on_list = 0;
    }
    run(db, 'update notes set title=?, text=?, note_type=?, pinned=?, archived=?, trashed=?, on_list=?, due_date=?, percent_done=?, position=?, updated_at=?, auto_title=? where id=?',
      next.title, next.text, next.note_type, next.pinned, next.archived, next.trashed, next.on_list, next.due_date, next.percent_done, next.position, content ? now() : cur.updated_at, next.auto_title, id);
    if (i.tags) setNoteTags(db, userId, id, i.tags);
    return getNote(db, userId, id);
  });
}

/**
 * Drag and drop: puts the note between two others. `above` is the note that should end up directly over it, `below` the one directly under it
 * (either may be missing at the ends). The position is the middle of the two; when they have become too close it renumbers everything first.
 */
export function moveNote(db: DB, userId: number, id: string, above?: string | null, below?: string | null): NoteDto {
  return tx(db, () => {
    getNote(db, userId, id);
    const pos = (n?: string | null) => (n ? (get(db, 'select position p from notes where id = ? and user_id = ?', n, userId)?.p as number | undefined) : undefined);
    const place = (): number => {
      const lo = pos(above), hi = pos(below);
      if (lo !== undefined && hi !== undefined) return hi - lo < 1e-7 ? NaN : (lo + hi) / 2;
      if (lo !== undefined) return lo + 1;
      if (hi !== undefined) return hi - 1;
      return topPosition(db, userId);
    };
    let p = place();
    if (Number.isNaN(p)) {
      all(db, 'select id from notes where user_id = ? order by position, updated_at desc', userId).forEach((r, k) => run(db, 'update notes set position = ? where id = ?', k + 1, r.id));
      p = place();
    }
    run(db, 'update notes set position = ? where id = ?', p, id);
    return getNote(db, userId, id);
  });
}

export function deleteNote(db: DB, userId: number, id: string) {
  const r = run(db, 'delete from notes where id = ? and user_id = ?', id, userId);
  if (!r.changes) throw new HttpError(404, 'Note not found');
  dropUnusedTags(db, userId);
}
export function emptyTrash(db: DB, userId: number): number {
  const n = Number(run(db, 'delete from notes where user_id = ? and trashed = 1', userId).changes);
  dropUnusedTags(db, userId);
  return n;
}

/**
 * Tags with how many notes carry each: only notes that were sent to tags (off the task list; a tag on a task does not show the task under that tag),
 * and only live ones (not archived, not binned), or with `archived` only the archived ones (the archive has the same tag column as Home).
 * `withTasks` (a setting of the page) counts the tasks that carry the tag too.
 */
export function listTags(db: DB, userId: number, pile: 'live' | 'archived' = 'live', withTasks = false) {
  return all(db, `select t.title, t.emoji, t.color, t.keep_tasks, t.retired, count(n.id) as count from tags t left join note_tags nt on nt.tag_id = t.id left join notes n on n.id = nt.note_id and n.trashed = 0 and n.archived = ?${withTasks ? '' : ' and n.on_list = 0'}
    where t.user_id = ? group by t.id order by t.title`, pile === 'archived' ? 1 : 0, userId).map((r) => ({ title: r.title as string, emoji: r.emoji as string, color: r.color as string, count: Number(r.count), ...(r.keep_tasks ? { keepTasks: true } : {}), ...(r.retired ? { retired: true } : {}) }));
}
/** For the tag manager: every tag wherever its notes are (on Home as notes, on the task list, in the archive, in the bin), and the parents that only exist as the front of a sub-tag's name. */
export function listTagsEverywhere(db: DB, userId: number) {
  const rows = all(db, `select t.title, t.emoji, t.color, t.keep_tasks, t.retired,
      coalesce(sum(n.trashed = 0 and n.archived = 0 and n.on_list = 0), 0) as notes, coalesce(sum(n.trashed = 0 and n.archived = 0 and n.on_list = 1), 0) as tasks,
      coalesce(sum(n.trashed = 0 and n.archived = 1), 0) as archived, coalesce(sum(n.trashed = 1), 0) as trashed
    from tags t left join note_tags nt on nt.tag_id = t.id left join notes n on n.id = nt.note_id where t.user_id = ? group by t.id order by t.title`, userId);
  return rows.map((r) => ({ title: r.title as string, emoji: r.emoji as string, color: r.color as string, notes: Number(r.notes), tasks: Number(r.tasks), archived: Number(r.archived), trashed: Number(r.trashed), ...(r.keep_tasks ? { keepTasks: true } : {}), ...(r.retired ? { retired: true } : {}) }));
}
export const CUSTOM = /^:[0-9a-f]{12}:$/;
/** The look of a tag: at most one emoji (or a short symbol) and a six-digit colour without '#'; empty clears it. */
export function styleTag(db: DB, userId: number, title: string, style: { emoji?: unknown; color?: unknown; keepTasks?: unknown; retired?: unknown }) {
  let src = get(db, 'select id, emoji, color from tags where user_id = ? and title = ?', userId, title);
  // a parent such as `work` has no row of its own while only `work.reports` carries notes: it gets one when it is given a look
  if (!src && get(db, "select 1 x from tags where user_id = ? and substr(title, 1, ?) = ?", userId, title.length + 1, `${title}.`)) { ensureTag(db, userId, title); src = get(db, 'select id, emoji, color from tags where user_id = ? and title = ?', userId, title); }
  if (!src) throw new HttpError(404, 'Tag not found');
  let emoji = String(src.emoji), color = String(src.color);
  if (style.emoji !== undefined) {
    const e = String(style.emoji).trim();
    // an imported emoji is ':<id>:' and must be one of yours
    emoji = CUSTOM.test(e) ? (get(db, 'select 1 x from custom_emoji where id = ? and user_id = ?', e.slice(1, -1), userId) ? e : '') : [...e].slice(0, 4).join('');
  }
  if (style.color !== undefined) {
    color = String(style.color).trim().replace(/^#/, '').toLowerCase();
    if (color && !/^[0-9a-f]{6}$/.test(color)) throw new HttpError(400, 'A colour is six hex digits, like ff8800');
  }
  run(db, 'update tags set emoji = ?, color = ? where id = ?', emoji, color, src.id);
  if (style.keepTasks !== undefined) run(db, 'update tags set keep_tasks = ? where id = ?', +!!style.keepTasks, src.id);
  if (style.retired !== undefined) run(db, 'update tags set retired = ? where id = ?', +!!style.retired, src.id);
}
/** Renames a tag and everything under it (`work` -> `job` also makes `work.reports` into `job.reports`); onto an existing tag it merges. */
export function renameTag(db: DB, userId: number, from: string, to: string) {
  const dest = cleanTag(to);
  if (!dest) throw new HttpError(400, 'A tag needs a name');
  tx(db, () => {
    const family = all(db, 'select id, title from tags where user_id = ? and (title = ? or substr(title, 1, ?) = ?) order by title', userId, from, from.length + 1, `${from}.`);
    if (!family.length) throw new HttpError(404, 'Tag not found');
    for (const src of family) {
      const next = dest + String(src.title).slice(from.length);
      const existing = get(db, 'select id from tags where user_id = ? and title = ?', userId, next);
      if (!existing) { run(db, 'update tags set title = ? where id = ?', next, src.id); continue; }
      if (existing.id === src.id) continue;
      const sty = get(db, 'select emoji, color from tags where id = ?', src.id)!;
      run(db, "update tags set emoji = case when emoji = '' then ? else emoji end, color = case when color = '' then ? else color end where id = ?", sty.emoji, sty.color, existing.id);
      run(db, 'insert or ignore into note_tags (note_id, tag_id, position) select note_id, ?, position from note_tags where tag_id = ?', existing.id, src.id);
      run(db, 'delete from tags where id = ?', src.id);
    }
  });
}
export function deleteTag(db: DB, userId: number, title: string, tree = false) {
  run(db, 'delete from tags where user_id = ? and title = ?', userId, title);
  if (tree) run(db, 'delete from tags where user_id = ? and substr(title, 1, ?) = ?', userId, title.length + 1, `${title}.`);
}

// ---- imported emoji ----
export interface EmojiRow { id: string; name: string }
const MAX_EMOJI = 300, MAX_EMOJI_BYTES = 120_000;
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isWebp = (b: Uint8Array) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;

export const listEmoji = (db: DB, userId: number): EmojiRow[] => all(db, 'select id, name from custom_emoji where user_id = ? order by created_at', userId).map((r) => ({ id: r.id as string, name: r.name as string }));

/** The page has already shrunk the picture to emoji size; this only checks it is a small PNG or WebP and keeps it. */
export function addEmoji(db: DB, userId: number, name: unknown, data: Uint8Array, id?: string): EmojiRow {
  if (data.length > MAX_EMOJI_BYTES) throw new HttpError(413, 'That emoji is too big: the page should shrink it to emoji size first');
  const mime = isPng(data) ? 'image/png' : isWebp(data) ? 'image/webp' : null;
  if (!mime) throw new HttpError(400, 'An emoji is a PNG or WebP picture');
  if (Number(get(db, 'select count(*) c from custom_emoji where user_id = ?', userId)!.c) >= MAX_EMOJI) throw new HttpError(400, `You can keep ${MAX_EMOJI} emoji`);
  const key = id ?? randomBytes(6).toString('hex');
  run(db, 'insert into custom_emoji (id, user_id, name, mime, data, created_at) values (?,?,?,?,?,?)', key, userId, String(name ?? '').trim().slice(0, 60), mime, data, now());
  return { id: key, name: String(name ?? '').trim().slice(0, 60) };
}
export const getEmoji = (db: DB, userId: number, id: string) => get(db, 'select mime, data from custom_emoji where id = ? and user_id = ?', id, userId) as { mime: string; data: Uint8Array } | undefined;
export function deleteEmoji(db: DB, userId: number, id: string) {
  run(db, 'delete from custom_emoji where id = ? and user_id = ?', id, userId);
  run(db, "update tags set emoji = '' where user_id = ? and emoji = ?", userId, `:${id}:`);
}
export const exportEmoji = (db: DB, userId: number) => all(db, 'select id, name, mime, data from custom_emoji where user_id = ? order by created_at', userId).map((r) => ({ id: r.id as string, name: r.name as string, mime: r.mime as string, data: Buffer.from(r.data as Uint8Array).toString('base64') }));
