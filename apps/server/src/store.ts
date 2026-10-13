import { randomUUID } from 'node:crypto';
import { type DB, type Row, all, get, run, tx, now } from './db.ts';

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 429, message: string, public extra?: object) { super(message); }
}

const bool = (v: unknown) => !!v;
const hex = (v: unknown) => (typeof v === 'string' ? v.replace(/^#/, '').toLowerCase().slice(0, 6) : '');
const dateOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (Number.isNaN(t)) throw new HttpError(400, 'Invalid date');
  return new Date(t).toISOString();
};

// ---------------- users ----------------

export function createUser(db: DB, username: string, passwordHash: string): number {
  return tx(db, () => {
    const id = Number(run(db, 'insert into users (username, password_hash, created_at) values (?,?,?)', username, passwordHash, now()).lastInsertRowid);
    inbox(db, id);
    return id;
  });
}

/** Tasks added without a project land here. Every user has exactly one. */
export function inbox(db: DB, userId: number): number {
  const r = get(db, 'select id from projects where user_id = ? and is_inbox = 1', userId);
  if (r) return r.id;
  const t = now();
  return Number(run(db, "insert into projects (user_id, title, is_inbox, created_at, updated_at) values (?, 'Inbox', 1, ?, ?)", userId, t, t).lastInsertRowid);
}

// ---------------- notes ----------------

export interface NoteDto { id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean; tags: string[]; createdAt: string; updatedAt: string }

const noteDto = (r: Row, tags: string[]): NoteDto => ({
  id: r.id, title: r.title, text: r.text, noteType: r.note_type, pinned: bool(r.pinned), archived: bool(r.archived), trashed: bool(r.trashed), tags, createdAt: r.created_at, updatedAt: r.updated_at,
});

function tagMap(db: DB, userId: number): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of all(db, 'select nt.note_id, t.title from note_tags nt join tags t on t.id = nt.tag_id where t.user_id = ? order by t.title', userId)) {
    (m.get(r.note_id) ?? m.set(r.note_id, []).get(r.note_id)!).push(r.title);
  }
  return m;
}

export interface NoteQuery { view?: 'notes' | 'archived' | 'trashed' | 'all'; tag?: string; q?: string }

export function listNotes(db: DB, userId: number, f: NoteQuery = {}): NoteDto[] {
  const where = ['n.user_id = ?'];
  const args: any[] = [userId];
  const view = f.view ?? 'notes';
  if (view === 'notes') where.push('n.archived = 0 and n.trashed = 0');
  else if (view === 'archived') where.push('n.archived = 1 and n.trashed = 0');
  else if (view === 'trashed') where.push('n.trashed = 1');
  if (f.tag) { where.push('exists (select 1 from note_tags nt join tags t on t.id = nt.tag_id where nt.note_id = n.id and (t.title = ? or t.title like ?))'); args.push(f.tag, `${f.tag}.%`); }
  if (f.q?.trim()) {
    for (const word of f.q.trim().split(/\s+/).slice(0, 8)) {
      where.push("(n.title like ? escape '\\' or n.text like ? escape '\\')");
      const like = `%${word.replace(/[\\%_]/g, '\\$&')}%`;
      args.push(like, like);
    }
  }
  const rows = all(db, `select n.* from notes n where ${where.join(' and ')} order by n.pinned desc, n.updated_at desc`, ...args);
  const tags = tagMap(db, userId);
  return rows.map((r) => noteDto(r, tags.get(r.id) ?? []));
}

export function getNote(db: DB, userId: number, id: string): NoteDto {
  const r = get(db, 'select * from notes where id = ? and user_id = ?', id, userId);
  if (!r) throw new HttpError(404, 'Note not found');
  return noteDto(r, tagTitles(db, id));
}
const tagTitles = (db: DB, noteId: string) => all(db, 'select t.title from note_tags nt join tags t on t.id = nt.tag_id where nt.note_id = ? order by t.title', noteId).map((r) => r.title as string);

function ensureTag(db: DB, userId: number, title: string): string {
  const r = get(db, 'select id from tags where user_id = ? and title = ?', userId, title);
  if (r) return r.id;
  const id = randomUUID(), t = now();
  run(db, 'insert into tags (id, user_id, title, created_at) values (?,?,?,?)', id, userId, title, t);
  return id;
}
const cleanTag = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);

function setNoteTags(db: DB, userId: number, noteId: string, tags: unknown) {
  const titles = [...new Set((Array.isArray(tags) ? tags : []).map(cleanTag).filter(Boolean))];
  run(db, 'delete from note_tags where note_id = ?', noteId);
  for (const t of titles) run(db, 'insert or ignore into note_tags (note_id, tag_id) values (?,?)', noteId, ensureTag(db, userId, t));
  run(db, 'delete from tags where user_id = ? and id not in (select tag_id from note_tags)', userId);
}

export interface NoteInput { title?: string; text?: string; noteType?: string; pinned?: boolean; archived?: boolean; trashed?: boolean; tags?: string[] }

export function createNote(db: DB, userId: number, i: NoteInput, keep?: { id?: string; createdAt?: string; updatedAt?: string }): NoteDto {
  return tx(db, () => {
    const id = keep?.id ?? randomUUID(), t = now();
    run(db, 'insert into notes (id, user_id, title, text, note_type, pinned, archived, trashed, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?)',
      id, userId, String(i.title ?? '').slice(0, 1000), String(i.text ?? ''), i.noteType || 'plain-text', +!!i.pinned, +!!i.archived, +!!i.trashed, keep?.createdAt ?? t, keep?.updatedAt ?? t);
    setNoteTags(db, userId, id, i.tags);
    return getNote(db, userId, id);
  });
}

/** `base` is the updatedAt the editor last saw: when the note has moved on since (another device), nothing is overwritten and the current note comes back. */
export function updateNote(db: DB, userId: number, id: string, i: NoteInput, base?: string): NoteDto {
  return tx(db, () => {
    const cur = get(db, 'select * from notes where id = ? and user_id = ?', id, userId);
    if (!cur) throw new HttpError(404, 'Note not found');
    if (base && base !== cur.updated_at) throw new HttpError(409, 'This note was changed somewhere else', { note: getNote(db, userId, id) });
    const next = {
      title: i.title === undefined ? cur.title : String(i.title).slice(0, 1000), text: i.text === undefined ? cur.text : String(i.text),
      note_type: i.noteType || cur.note_type, pinned: i.pinned === undefined ? cur.pinned : +!!i.pinned,
      archived: i.archived === undefined ? cur.archived : +!!i.archived, trashed: i.trashed === undefined ? cur.trashed : +!!i.trashed,
    };
    run(db, 'update notes set title=?, text=?, note_type=?, pinned=?, archived=?, trashed=?, updated_at=? where id=?', next.title, next.text, next.note_type, next.pinned, next.archived, next.trashed, now(), id);
    if (i.tags) setNoteTags(db, userId, id, i.tags);
    return getNote(db, userId, id);
  });
}

export function deleteNote(db: DB, userId: number, id: string) {
  const r = run(db, 'delete from notes where id = ? and user_id = ?', id, userId);
  if (!r.changes) throw new HttpError(404, 'Note not found');
  run(db, 'delete from tags where user_id = ? and id not in (select tag_id from note_tags)', userId);
}
export function emptyTrash(db: DB, userId: number): number {
  const n = Number(run(db, 'delete from notes where user_id = ? and trashed = 1', userId).changes);
  run(db, 'delete from tags where user_id = ? and id not in (select tag_id from note_tags)', userId);
  return n;
}
export function listTags(db: DB, userId: number) {
  return all(db, `select t.title, count(n.id) as count from tags t left join note_tags nt on nt.tag_id = t.id left join notes n on n.id = nt.note_id and n.trashed = 0
    where t.user_id = ? group by t.id order by t.title`, userId).map((r) => ({ title: r.title as string, count: Number(r.count) }));
}
export function renameTag(db: DB, userId: number, from: string, to: string) {
  const dest = cleanTag(to);
  if (!dest) throw new HttpError(400, 'A tag needs a name');
  tx(db, () => {
    const src = get(db, 'select id from tags where user_id = ? and title = ?', userId, from);
    if (!src) throw new HttpError(404, 'Tag not found');
    const existing = get(db, 'select id from tags where user_id = ? and title = ?', userId, dest);
    if (!existing) { run(db, 'update tags set title = ? where id = ?', dest, src.id); return; }
    if (existing.id === src.id) return;
    run(db, 'insert or ignore into note_tags (note_id, tag_id) select note_id, ? from note_tags where tag_id = ?', existing.id, src.id);
    run(db, 'delete from tags where id = ?', src.id);
  });
}
export function deleteTag(db: DB, userId: number, title: string) {
  run(db, 'delete from tags where user_id = ? and title = ?', userId, title);
}

// ---------------- projects and labels ----------------

export interface ProjectDto { id: number; title: string; description: string; hexColor: string; parentId: number | null; isArchived: boolean; isFavorite: boolean; isInbox: boolean; position: number; openTasks: number }

const projectDto = (r: Row): ProjectDto => ({ id: r.id, title: r.title, description: r.description, hexColor: r.hex_color, parentId: r.parent_id, isArchived: bool(r.is_archived), isFavorite: bool(r.is_favorite), isInbox: bool(r.is_inbox), position: r.position, openTasks: Number(r.open_tasks ?? 0) });

export function listProjects(db: DB, userId: number): ProjectDto[] {
  return all(db, `select p.*, (select count(*) from tasks t where t.project_id = p.id and t.done = 0) as open_tasks from projects p where p.user_id = ? order by p.is_inbox desc, p.position, p.id`, userId).map(projectDto);
}
const ownProject = (db: DB, userId: number, id: number) => { const r = get(db, 'select * from projects where id = ? and user_id = ?', id, userId); if (!r) throw new HttpError(404, 'Project not found'); return r; };

export interface ProjectInput { title?: string; description?: string; hexColor?: string; parentId?: number | null; isArchived?: boolean; isFavorite?: boolean; position?: number }

export function createProject(db: DB, userId: number, i: ProjectInput): ProjectDto {
  const title = String(i.title ?? '').trim();
  if (!title) throw new HttpError(400, 'A project needs a title');
  if (i.parentId) ownProject(db, userId, i.parentId);
  const t = now();
  const id = Number(run(db, 'insert into projects (user_id, title, description, hex_color, parent_id, is_archived, is_favorite, position, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?)',
    userId, title.slice(0, 250), String(i.description ?? ''), hex(i.hexColor), i.parentId ?? null, +!!i.isArchived, +!!i.isFavorite, i.position ?? 0, t, t).lastInsertRowid);
  return projectDto(ownProject(db, userId, id));
}
export function updateProject(db: DB, userId: number, id: number, i: ProjectInput): ProjectDto {
  const cur = ownProject(db, userId, id);
  if (i.parentId) {
    ownProject(db, userId, i.parentId);
    // never make a project its own ancestor
    for (let p: number | null = i.parentId; p; p = get(db, 'select parent_id from projects where id = ?', p)?.parent_id ?? null) if (p === id) throw new HttpError(400, 'A project cannot sit inside itself');
  }
  if (cur.is_inbox && (i.parentId || i.isArchived)) throw new HttpError(400, 'The Inbox cannot be moved or archived');
  run(db, 'update projects set title=?, description=?, hex_color=?, parent_id=?, is_archived=?, is_favorite=?, position=?, updated_at=? where id=?',
    i.title === undefined ? cur.title : String(i.title).trim().slice(0, 250) || cur.title, i.description === undefined ? cur.description : String(i.description),
    i.hexColor === undefined ? cur.hex_color : hex(i.hexColor), i.parentId === undefined ? cur.parent_id : i.parentId, i.isArchived === undefined ? cur.is_archived : +!!i.isArchived,
    i.isFavorite === undefined ? cur.is_favorite : +!!i.isFavorite, i.position === undefined ? cur.position : Number(i.position), now(), id);
  return projectDto(ownProject(db, userId, id));
}
export function deleteProject(db: DB, userId: number, id: number) {
  const cur = ownProject(db, userId, id);
  if (cur.is_inbox) throw new HttpError(400, 'The Inbox cannot be deleted');
  tx(db, () => {
    run(db, 'update projects set parent_id = ? where parent_id = ?', cur.parent_id, id); // children move up
    run(db, 'delete from projects where id = ?', id);
  });
}

export interface LabelDto { id: number; title: string; description: string; hexColor: string }
const labelDto = (r: Row): LabelDto => ({ id: r.id, title: r.title, description: r.description, hexColor: r.hex_color });
export const listLabels = (db: DB, userId: number) => all(db, 'select * from labels where user_id = ? order by title collate nocase', userId).map(labelDto);

export function ensureLabel(db: DB, userId: number, title: string, hexColor = '', description = ''): number {
  const t = title.trim().slice(0, 250), h = hex(hexColor);
  const r = get(db, 'select id from labels where user_id = ? and title = ? collate nocase and hex_color = ?', userId, t, h) ?? get(db, 'select id from labels where user_id = ? and title = ? collate nocase', userId, t);
  if (r) return r.id;
  const n = now();
  return Number(run(db, 'insert into labels (user_id, title, description, hex_color, created_at, updated_at) values (?,?,?,?,?,?)', userId, t, description, h, n, n).lastInsertRowid);
}
export function updateLabel(db: DB, userId: number, id: number, i: { title?: string; hexColor?: string; description?: string }): LabelDto {
  const cur = get(db, 'select * from labels where id = ? and user_id = ?', id, userId);
  if (!cur) throw new HttpError(404, 'Label not found');
  run(db, 'update labels set title=?, hex_color=?, description=?, updated_at=? where id=?', i.title?.trim() || cur.title, i.hexColor === undefined ? cur.hex_color : hex(i.hexColor), i.description ?? cur.description, now(), id);
  return labelDto(get(db, 'select * from labels where id = ?', id)!);
}
export function deleteLabel(db: DB, userId: number, id: number) {
  if (!run(db, 'delete from labels where id = ? and user_id = ?', id, userId).changes) throw new HttpError(404, 'Label not found');
}

// ---------------- tasks ----------------

export const RELATION_KINDS = ['subtask', 'parenttask', 'related', 'duplicateof', 'duplicates', 'blocking', 'blocked', 'precedes', 'follows', 'copiedfrom', 'copiedto'] as const;
export const INVERSE: Record<string, string> = { subtask: 'parenttask', parenttask: 'subtask', related: 'related', duplicateof: 'duplicates', duplicates: 'duplicateof', blocking: 'blocked', blocked: 'blocking', precedes: 'follows', follows: 'precedes', copiedfrom: 'copiedto', copiedto: 'copiedfrom' };

export interface TaskDto {
  id: number; projectId: number; index: number; title: string; description: string; done: boolean; doneAt: string | null; dueDate: string | null; startDate: string | null; endDate: string | null;
  priority: number; percentDone: number; hexColor: string; isFavorite: boolean; position: number; repeatAfter: number; repeatMode: number; createdAt: string; updatedAt: string;
  labels: LabelDto[]; reminders: { reminder: string | null; relativePeriod: number; relativeTo: string }[]; related: Record<string, { id: number; title: string; projectId: number; done: boolean }[]>;
  comments: { id: number; comment: string; author: string; createdAt: string; updatedAt: string }[]; commentCount: number;
}

function hydrate(db: DB, userId: number, rows: Row[], full: boolean): TaskDto[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id), ph = ids.map(() => '?').join(',');
  const group = <T extends Row>(sql: string): Map<number, T[]> => { const m = new Map<number, T[]>(); for (const r of all(db, sql, ...ids) as T[]) (m.get(r.task_id) ?? m.set(r.task_id, []).get(r.task_id)!).push(r); return m; };
  const labels = group(`select tl.task_id, l.* from task_labels tl join labels l on l.id = tl.label_id where tl.task_id in (${ph}) order by l.title collate nocase`);
  const reminders = group(`select * from task_reminders where task_id in (${ph}) order by id`);
  const rel = group(`select r.task_id, r.kind, o.id, o.title, o.project_id, o.done from task_relations r join tasks o on o.id = r.other_task_id where r.task_id in (${ph}) order by o.id`);
  const comments = group(`select * from task_comments where task_id in (${ph}) order by id`);
  // each task's number inside its project, in creation order (Vikunja's "#12")
  const index = new Map<number, number>();
  const seq = new Map<number, number>();
  for (const r of all(db, 'select id, project_id from tasks where user_id = ? order by id', userId)) { const n = (seq.get(r.project_id) ?? 0) + 1; seq.set(r.project_id, n); index.set(r.id, n); }
  return rows.map((r): TaskDto => {
    const related: TaskDto['related'] = {};
    for (const x of rel.get(r.id) ?? []) (related[x.kind] ??= []).push({ id: x.id, title: x.title, projectId: x.project_id, done: bool(x.done) });
    const cs = comments.get(r.id) ?? [];
    return {
      id: r.id, projectId: r.project_id, index: index.get(r.id) ?? 0, title: r.title, description: r.description, done: bool(r.done), doneAt: r.done_at, dueDate: r.due_date, startDate: r.start_date, endDate: r.end_date,
      priority: r.priority, percentDone: r.percent_done, hexColor: r.hex_color, isFavorite: bool(r.is_favorite), position: r.position, repeatAfter: r.repeat_after, repeatMode: r.repeat_mode, createdAt: r.created_at, updatedAt: r.updated_at,
      labels: (labels.get(r.id) ?? []).map(labelDto), reminders: (reminders.get(r.id) ?? []).map((x) => ({ reminder: x.reminder, relativePeriod: x.relative_period, relativeTo: x.relative_to })), related,
      comments: full ? cs.map((c) => ({ id: c.id, comment: c.comment, author: c.author, createdAt: c.created_at, updatedAt: c.updated_at })) : [], commentCount: cs.length,
    };
  });
}

export interface TaskQuery { projectId?: number; done?: boolean; q?: string; due?: 'today' | 'overdue' | 'week' | 'none' | 'any'; labelId?: number; favorites?: boolean }

export function listTasks(db: DB, userId: number, f: TaskQuery = {}): TaskDto[] {
  const where = ['t.user_id = ?'], args: any[] = [userId];
  if (f.projectId) { where.push('t.project_id = ?'); args.push(f.projectId); }
  if (f.done !== undefined) { where.push('t.done = ?'); args.push(+f.done); }
  if (f.favorites) where.push('t.is_favorite = 1');
  if (f.labelId) { where.push('exists (select 1 from task_labels tl where tl.task_id = t.id and tl.label_id = ?)'); args.push(f.labelId); }
  if (f.q?.trim()) for (const w of f.q.trim().split(/\s+/).slice(0, 8)) { where.push("(t.title like ? escape '\\' or t.description like ? escape '\\')"); const l = `%${w.replace(/[\\%_]/g, '\\$&')}%`; args.push(l, l); }
  const d = new Date(), startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400_000), endOfWeek = new Date(startOfDay.getTime() + 7 * 86400_000);
  if (f.due === 'today') { where.push('t.due_date >= ? and t.due_date < ?'); args.push(startOfDay.toISOString(), endOfDay.toISOString()); }
  else if (f.due === 'overdue') { where.push('t.due_date < ? and t.done = 0'); args.push(startOfDay.toISOString()); }
  else if (f.due === 'week') { where.push('t.due_date >= ? and t.due_date < ?'); args.push(startOfDay.toISOString(), endOfWeek.toISOString()); }
  else if (f.due === 'none') where.push('t.due_date is null');
  else if (f.due === 'any') where.push('t.due_date is not null');
  const rows = all(db, `select t.* from tasks t where ${where.join(' and ')} order by t.done, t.position, t.id`, ...args);
  return hydrate(db, userId, rows, false);
}

export function getTask(db: DB, userId: number, id: number): TaskDto {
  const r = get(db, 'select * from tasks where id = ? and user_id = ?', id, userId);
  if (!r) throw new HttpError(404, 'Task not found');
  return hydrate(db, userId, [r], true)[0]!;
}

export interface TaskInput {
  title?: string; description?: string; projectId?: number; done?: boolean; dueDate?: string | null; startDate?: string | null; endDate?: string | null; priority?: number; percentDone?: number;
  hexColor?: string; isFavorite?: boolean; position?: number; repeatAfter?: number; repeatMode?: number; labels?: string[]; reminders?: { reminder: string | null; relativePeriod?: number; relativeTo?: string }[];
}

function setLabels(db: DB, userId: number, taskId: number, titles: unknown) {
  const list = [...new Set((Array.isArray(titles) ? titles : []).map((t) => String(t).trim()).filter(Boolean))];
  run(db, 'delete from task_labels where task_id = ?', taskId);
  for (const t of list) run(db, 'insert or ignore into task_labels (task_id, label_id) values (?,?)', taskId, ensureLabel(db, userId, t));
}
function setReminders(db: DB, taskId: number, list: TaskInput['reminders']) {
  run(db, 'delete from task_reminders where task_id = ?', taskId);
  for (const r of list ?? []) {
    const when = dateOrNull(r.reminder), rt = ['due_date', 'start_date', 'end_date'].includes(r.relativeTo ?? '') ? r.relativeTo! : '';
    if (!when && !rt) continue;
    run(db, 'insert into task_reminders (task_id, reminder, relative_period, relative_to) values (?,?,?,?)', taskId, when, Math.round(Number(r.relativePeriod) || 0), rt);
  }
}

export function createTask(db: DB, userId: number, i: TaskInput, keep?: { createdAt?: string; updatedAt?: string }): TaskDto {
  const title = String(i.title ?? '').trim();
  if (!title) throw new HttpError(400, 'A task needs a title');
  return tx(db, () => {
    const project = i.projectId ? ownProject(db, userId, i.projectId).id : inbox(db, userId);
    const t = now();
    const done = !!i.done;
    const id = Number(run(db, `insert into tasks (user_id, project_id, title, description, done, done_at, due_date, start_date, end_date, priority, percent_done, hex_color, is_favorite, position, repeat_after, repeat_mode, created_at, updated_at)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      userId, project, title.slice(0, 1000), String(i.description ?? ''), +done, done ? t : null, dateOrNull(i.dueDate), dateOrNull(i.startDate), dateOrNull(i.endDate), clamp(i.priority, 0, 5), clamp(i.percentDone, 0, 1),
      hex(i.hexColor), +!!i.isFavorite, Number(i.position) || 0, Math.max(0, Math.round(Number(i.repeatAfter) || 0)), [0, 1, 2].includes(i.repeatMode as number) ? (i.repeatMode as number) : 0, keep?.createdAt ?? t, keep?.updatedAt ?? t).lastInsertRowid);
    if (i.labels) setLabels(db, userId, id, i.labels);
    if (i.reminders) setReminders(db, id, i.reminders);
    return getTask(db, userId, id);
  });
}
const clamp = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));

/** What Vikunja does when you tick a repeating task: it stays open and its dates move forward. */
export function nextDates(t: { due_date: string | null; start_date: string | null; end_date: string | null; repeat_after: number; repeat_mode: number }, at = new Date()) {
  const move = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (t.repeat_mode === 1) { d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString(); }
    if (t.repeat_mode === 2) return new Date(at.getTime() + t.repeat_after * 1000).toISOString();
    const step = t.repeat_after * 1000;
    const n = Math.max(1, Math.ceil((at.getTime() - d.getTime()) / step) || 1);
    let r = new Date(d.getTime() + n * step);
    if (r <= at) r = new Date(r.getTime() + step);
    return r.toISOString();
  };
  return { due_date: move(t.due_date), start_date: move(t.start_date), end_date: move(t.end_date) };
}

export function updateTask(db: DB, userId: number, id: number, i: TaskInput): TaskDto {
  return tx(db, () => {
    const cur = get(db, 'select * from tasks where id = ? and user_id = ?', id, userId);
    if (!cur) throw new HttpError(404, 'Task not found');
    const n: Row = {
      project_id: i.projectId === undefined ? cur.project_id : ownProject(db, userId, i.projectId).id,
      title: i.title === undefined ? cur.title : String(i.title).trim().slice(0, 1000) || cur.title,
      description: i.description === undefined ? cur.description : String(i.description),
      due_date: i.dueDate === undefined ? cur.due_date : dateOrNull(i.dueDate), start_date: i.startDate === undefined ? cur.start_date : dateOrNull(i.startDate), end_date: i.endDate === undefined ? cur.end_date : dateOrNull(i.endDate),
      priority: i.priority === undefined ? cur.priority : clamp(i.priority, 0, 5), percent_done: i.percentDone === undefined ? cur.percent_done : clamp(i.percentDone, 0, 1),
      hex_color: i.hexColor === undefined ? cur.hex_color : hex(i.hexColor), is_favorite: i.isFavorite === undefined ? cur.is_favorite : +!!i.isFavorite, position: i.position === undefined ? cur.position : Number(i.position) || 0,
      repeat_after: i.repeatAfter === undefined ? cur.repeat_after : Math.max(0, Math.round(Number(i.repeatAfter) || 0)), repeat_mode: i.repeatMode === undefined ? cur.repeat_mode : ([0, 1, 2].includes(i.repeatMode) ? i.repeatMode : 0),
      done: cur.done, done_at: cur.done_at,
    };
    if (i.done !== undefined && +!!i.done !== cur.done) {
      const repeats = (n.repeat_after > 0 || n.repeat_mode === 1) && (n.due_date || n.start_date || n.end_date);
      if (i.done && repeats) Object.assign(n, nextDates({ ...n } as any)); // stays open, dates move on
      else { n.done = +!!i.done; n.done_at = i.done ? now() : null; }
    }
    run(db, `update tasks set project_id=?, title=?, description=?, done=?, done_at=?, due_date=?, start_date=?, end_date=?, priority=?, percent_done=?, hex_color=?, is_favorite=?, position=?, repeat_after=?, repeat_mode=?, updated_at=? where id=?`,
      n.project_id, n.title, n.description, n.done, n.done_at, n.due_date, n.start_date, n.end_date, n.priority, n.percent_done, n.hex_color, n.is_favorite, n.position, n.repeat_after, n.repeat_mode, now(), id);
    if (i.labels) setLabels(db, userId, id, i.labels);
    if (i.reminders) setReminders(db, id, i.reminders);
    return getTask(db, userId, id);
  });
}

export function deleteTask(db: DB, userId: number, id: number) {
  if (!run(db, 'delete from tasks where id = ? and user_id = ?', id, userId).changes) throw new HttpError(404, 'Task not found');
}

export function addRelation(db: DB, userId: number, taskId: number, otherId: number, kind: string) {
  if (!(kind in INVERSE)) throw new HttpError(400, 'Unknown relation');
  if (taskId === otherId) throw new HttpError(400, 'A task cannot be related to itself');
  getTask(db, userId, taskId); getTask(db, userId, otherId);
  tx(db, () => {
    run(db, 'insert or ignore into task_relations (task_id, other_task_id, kind) values (?,?,?)', taskId, otherId, kind);
    run(db, 'insert or ignore into task_relations (task_id, other_task_id, kind) values (?,?,?)', otherId, taskId, INVERSE[kind]);
  });
}
export function removeRelation(db: DB, userId: number, taskId: number, otherId: number, kind: string) {
  getTask(db, userId, taskId);
  tx(db, () => {
    run(db, 'delete from task_relations where task_id = ? and other_task_id = ? and kind = ?', taskId, otherId, kind);
    run(db, 'delete from task_relations where task_id = ? and other_task_id = ? and kind = ?', otherId, taskId, INVERSE[kind] ?? '');
  });
}

export function addComment(db: DB, userId: number, taskId: number, comment: string, author: string, at?: { created?: string; updated?: string }) {
  getTask(db, userId, taskId);
  const text = comment.trim();
  if (!text) throw new HttpError(400, 'Empty comment');
  const t = now();
  run(db, 'insert into task_comments (task_id, comment, author, created_at, updated_at) values (?,?,?,?,?)', taskId, text, author, at?.created ?? t, at?.updated ?? at?.created ?? t);
}
export function deleteComment(db: DB, userId: number, taskId: number, commentId: number) {
  getTask(db, userId, taskId);
  run(db, 'delete from task_comments where id = ? and task_id = ?', commentId, taskId);
}
