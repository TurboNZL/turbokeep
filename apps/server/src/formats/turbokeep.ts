import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ImportError } from './types.ts';

/**
 * TurboKeep's own backup: everything in one file, notes and tasks together (a task is a note with task fields), so nothing is lost and it can be
 * moved to another server or account.
 *   turbokeep.json   { format: "turbokeep", version: 1, exportedAt, projects[], notes[] (each with its tag names and its task if it has one), relations[] }
 * Zipped as turbokeep-<date>.zip; a bare turbokeep.json is read too. A file written by a NEWER version is refused instead of half-read.
 */
export const FORMAT = 'turbokeep';
export const FORMAT_VERSION = 1;
export const FILE = 'turbokeep.json';

export interface TkProject { id: number; title: string; description: string; hexColor: string; parentId: number | null; isArchived: boolean; isFavorite: boolean; isInbox: boolean; position: number }
export interface TkReminder { reminder: string | null; relativePeriod: number; relativeTo: string }
export interface TkComment { comment: string; author: string; createdAt: string; updatedAt: string }
export interface TkTask {
  projectId: number; done: boolean; doneAt: string | null; dueDate: string | null; startDate: string | null; endDate: string | null; priority: number; percentDone: number;
  hexColor: string; isFavorite: boolean; position: number; repeatAfter: number; repeatMode: number; createdAt: string; updatedAt: string;
  reminders: TkReminder[]; comments: TkComment[];
}
export interface TkNote {
  id: string; title: string; text: string; noteType: string; pinned: boolean; archived: boolean; trashed: boolean; tags: string[]; createdAt: string; updatedAt: string;
  task: TkTask | null;
}
export interface TkRelation { noteId: string; otherNoteId: string; kind: string }
export interface TkTagStyle { title: string; emoji: string; color: string }
export interface TkBundle { projects: TkProject[]; notes: TkNote[]; relations: TkRelation[]; /** tags that have an emoji or a colour (optional: older backups have none) */ tagStyles: TkTagStyle[] }

export function buildTurboKeepZip(bundle: TkBundle, appVersion: string): Uint8Array {
  const json = JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), appVersion, ...bundle }, null, 1);
  return zipSync({ [FILE]: strToU8(json) }, { level: 6 });
}

const str = (v: unknown, max = 1_000_000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown) => v === true;
const date = (v: unknown): string | null => { if (typeof v !== 'string' || !v) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTurboKeep(data: Uint8Array): { bundle: TkBundle; warnings: string[] } {
  let text: string;
  if (data.length > 3 && data[0] === 0x50 && data[1] === 0x4b) {
    let entries: Record<string, Uint8Array>;
    try { entries = unzipSync(data, { filter: (f) => f.name === FILE || f.name.endsWith(`/${FILE}`) }); } catch { throw new ImportError('That file looks like a zip but cannot be opened.'); }
    const name = Object.keys(entries)[0];
    if (!name) throw new ImportError(`This zip has no ${FILE}, so it is not a TurboKeep backup.`);
    text = strFromU8(entries[name]!);
  } else text = strFromU8(data);
  let j: any;
  try { j = JSON.parse(text); } catch { throw new ImportError(`${FILE} is not valid JSON.`); }
  if (j?.format !== FORMAT) throw new ImportError('That is not a TurboKeep backup.');
  if (typeof j.version !== 'number' || j.version > FORMAT_VERSION) throw new ImportError(`This backup was made by a newer TurboKeep (format ${j.version}); update TurboKeep first.`);
  const warnings: string[] = [];

  const projects: TkProject[] = (Array.isArray(j.projects) ? j.projects : []).filter((p: any) => p && Number.isInteger(p.id)).map((p: any): TkProject => ({
    id: p.id, title: str(p.title, 250) || 'Untitled project', description: str(p.description), hexColor: str(p.hexColor, 6), parentId: Number.isInteger(p.parentId) ? p.parentId : null,
    isArchived: bool(p.isArchived), isFavorite: bool(p.isFavorite), isInbox: bool(p.isInbox), position: num(p.position),
  }));
  const seen = new Set<string>();
  const notes: TkNote[] = [];
  for (const n of Array.isArray(j.notes) ? j.notes : []) {
    if (!n || typeof n.id !== 'string' || !UUID.test(n.id) || seen.has(n.id.toLowerCase())) { warnings.push('A note without a valid id (or listed twice) was skipped.'); continue; }
    seen.add(n.id.toLowerCase());
    const t = n.task && typeof n.task === 'object' ? n.task : null;
    notes.push({
      id: n.id.toLowerCase(), title: str(n.title, 1000), text: str(n.text), noteType: str(n.noteType, 40) || 'plain-text', pinned: bool(n.pinned), archived: bool(n.archived), trashed: bool(n.trashed),
      tags: [...new Set((Array.isArray(n.tags) ? n.tags : []).map((x: unknown) => str(x, 80).trim()).filter(Boolean))] as string[],
      createdAt: date(n.createdAt) ?? new Date().toISOString(), updatedAt: date(n.updatedAt) ?? date(n.createdAt) ?? new Date().toISOString(),
      task: t && {
        projectId: Number.isInteger(t.projectId) ? t.projectId : 0, done: bool(t.done), doneAt: date(t.doneAt), dueDate: date(t.dueDate), startDate: date(t.startDate), endDate: date(t.endDate),
        priority: Math.min(5, Math.max(0, Math.round(num(t.priority)))), percentDone: Math.min(1, Math.max(0, num(t.percentDone))), hexColor: str(t.hexColor, 6), isFavorite: bool(t.isFavorite),
        position: num(t.position), repeatAfter: Math.max(0, Math.round(num(t.repeatAfter))), repeatMode: [0, 1, 2].includes(t.repeatMode) ? t.repeatMode : 0,
        createdAt: date(t.createdAt) ?? date(n.createdAt) ?? new Date().toISOString(), updatedAt: date(t.updatedAt) ?? date(n.updatedAt) ?? new Date().toISOString(),
        reminders: (Array.isArray(t.reminders) ? t.reminders : []).map((r: any): TkReminder => ({ reminder: date(r?.reminder), relativePeriod: Math.round(num(r?.relativePeriod)), relativeTo: str(r?.relativeTo, 20) })).filter((r: TkReminder) => r.reminder || r.relativeTo),
        comments: (Array.isArray(t.comments) ? t.comments : []).filter((c: any) => c && str(c.comment)).map((c: any): TkComment => ({ comment: str(c.comment), author: str(c.author, 60), createdAt: date(c.createdAt) ?? new Date().toISOString(), updatedAt: date(c.updatedAt) ?? date(c.createdAt) ?? new Date().toISOString() })),
      },
    });
  }
  const relations: TkRelation[] = (Array.isArray(j.relations) ? j.relations : []).filter((r: any) => r && typeof r.noteId === 'string' && typeof r.otherNoteId === 'string' && typeof r.kind === 'string')
    .map((r: any) => ({ noteId: r.noteId.toLowerCase(), otherNoteId: r.otherNoteId.toLowerCase(), kind: r.kind }));
  const tagStyles: TkTagStyle[] = (Array.isArray(j.tagStyles) ? j.tagStyles : []).filter((t: any) => t && typeof t.title === 'string' && t.title).map((t: any) => ({
    title: String(t.title).slice(0, 200), emoji: typeof t.emoji === 'string' ? [...t.emoji].slice(0, 4).join('') : '', color: /^[0-9a-f]{6}$/i.test(String(t.color ?? '')) ? String(t.color).toLowerCase() : '' }));
  return { bundle: { projects, notes, relations, tagStyles }, warnings };
}
