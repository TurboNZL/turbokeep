import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ImportError, type ProjectIn, type TaskIn } from './types.ts';

/**
 * Vikunja's data export (Settings > Data export in Vikunja; read by "Import from Vikunja file" in another instance). Checked against
 * go-vikunja/vikunja pkg/modules/migration/vikunja-file and create_from_structure.go:
 *   VERSION        required; must be >= 0.20.1+61
 *   data.json      required; an array of projects (a flat list, children point at their parent with parent_project_id), each with its tasks
 *   filters.json   optional saved filters (not used here)
 *   files/<id>     attachments and backgrounds (not carried over here)
 * Times are Go's RFC 3339; an unset time is "0001-01-01T00:00:00Z".
 */
export const ZERO_TIME = '0001-01-01T00:00:00Z';
export const EXPORT_VERSION = '1.0.0';


// ---- text <-> HTML ----
// Vikunja keeps descriptions and comments as HTML (its editor writes <p>, <ul>, <strong> ...). This app keeps plain text, so HTML is flattened on the
// way in and text is wrapped in <p>/<br> on the way out. Formatting such as bold or links does not survive; the words and line breaks do.
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const LOOKS_HTML = /<\/?(p|br|div|ul|ol|li|h[1-6]|strong|em|b|i|u|s|a|span|code|pre|blockquote|hr|img|table|tr|td|th|input|label)\b[^>]*>/i;

export function htmlToText(html: string): string {
  if (!LOOKS_HTML.test(html)) return html;
  let s = html.replace(/\r\n?/g, '\n');
  s = s.replace(/<li\b[^>]*data-checked="(true|false)"[^>]*>/gi, (_m, c: string) => `\n${c === 'true' ? '[x]' : '[ ]'} `);
  s = s.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|ul|ol|h[1-6]|blockquote|pre|table|tr)>/gi, '\n\n');
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => { const t = text.replace(/<[^>]+>/g, ''); return t && t !== href ? `${t} (${href})` : href; });
  s = s.replace(/<[^>]+>/g, '');
  return decode(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function textToHtml(text: string): string {
  if (!text) return '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

const date = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return d.getUTCFullYear() <= 1 ? null : d.toISOString();
};
const hex = (v: unknown) => (typeof v === 'string' ? v.replace(/^#/, '').toLowerCase() : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseVikunja(data: Uint8Array): { projects: ProjectIn[]; warnings: string[] } {
  const warnings: string[] = [];
  let json: string;
  if (data.length > 3 && data[0] === 0x50 && data[1] === 0x4b) {
    let entries: Record<string, Uint8Array>;
    try { entries = unzipSync(data, { filter: (f) => f.name === 'data.json' || f.name === 'VERSION' }); } catch { throw new ImportError('That file looks like a zip but cannot be opened.'); }
    if (!entries['data.json']) throw new ImportError('This zip has no data.json, so it is not a Vikunja data export.');
    json = strFromU8(entries['data.json']);
  } else json = strFromU8(data);
  let raw: any;
  try { raw = JSON.parse(json); } catch { throw new ImportError('data.json is not valid JSON.'); }
  if (!Array.isArray(raw)) throw new ImportError('data.json should be a list of projects.');

  let attachments = 0;
  const projects: ProjectIn[] = [];
  // Vikunja also nests child projects; flatten so both shapes import the same way
  const visit = (p: any, parentOld: number | null) => {
    if (!p || typeof p !== 'object' || p.id === -1) return; // -1 is the "Favorites" pseudo project, its tasks live in their own project
    const tasks: TaskIn[] = (Array.isArray(p.tasks) ? p.tasks : []).filter((t: any) => t && str(t.title)).map((t: any): TaskIn => {
      const files = Array.isArray(t.attachments) ? t.attachments.length : 0;
      attachments += files;
      const related: TaskIn['related'] = {};
      for (const [kind, list] of Object.entries(t.related_tasks ?? {})) {
        if (!Array.isArray(list)) continue;
        related[kind] = list.filter((r: any) => r && typeof r.id === 'number').map((r: any) => ({ oldId: r.id as number, title: str(r.title) }));
      }
      return {
        oldId: num(t.id), title: str(t.title), description: htmlToText(str(t.description)), done: !!t.done, doneAt: date(t.done_at),
        dueDate: date(t.due_date), startDate: date(t.start_date), endDate: date(t.end_date),
        priority: Math.min(5, Math.max(0, Math.round(num(t.priority)))), percentDone: Math.min(1, Math.max(0, num(t.percent_done))),
        hexColor: hex(t.hex_color), isFavorite: !!t.is_favorite, position: num(t.position),
        repeatAfter: Math.max(0, Math.round(num(t.repeat_after))), repeatMode: Math.round(num(t.repeat_mode)),
        labels: (Array.isArray(t.labels) ? t.labels : []).filter((l: any) => l && str(l.title)).map((l: any) => ({ title: str(l.title), description: str(l.description), hexColor: hex(l.hex_color) })),
        reminders: (Array.isArray(t.reminders) ? t.reminders : []).map((r: any) => ({ reminder: date(r?.reminder), relativePeriod: Math.round(num(r?.relative_period)), relativeTo: str(r?.relative_to) })).filter((r: any) => r.reminder || r.relativeTo),
        related,
        comments: (Array.isArray(t.comments) ? t.comments : []).filter((c: any) => c && str(c.comment)).map((c: any) => ({ comment: htmlToText(str(c.comment)), author: str(c.author?.username) || str(c.author?.name), created: date(c.created) ?? undefined, updated: date(c.updated) ?? undefined })),
        created: date(t.created) ?? undefined, updated: date(t.updated) ?? undefined, attachments: files,
      };
    });
    const parent = typeof p.parent_project_id === 'number' && p.parent_project_id > 0 ? p.parent_project_id : parentOld;
    projects.push({
      oldId: num(p.id), parentOldId: parent, title: str(p.title) || 'Untitled project', description: htmlToText(str(p.description)), hexColor: hex(p.hex_color),
      isArchived: !!p.is_archived, isFavorite: !!p.is_favorite, position: num(p.position), tasks,
    });
    for (const child of Array.isArray(p.child_projects) ? p.child_projects : []) visit(child, num(p.id));
  };
  for (const p of raw) visit(p, null);
  if (!projects.length) throw new ImportError('No projects found in that file.');
  if (attachments) warnings.push(`${attachments} attachment${attachments === 1 ? '' : 's'} were not imported (this app does not store files).`);
  return { projects, warnings };
}

// ---- export ----

export interface VUser { id: number; username: string; created: string }
export interface VTask {
  id: number; projectId: number; index: number; title: string; description: string; done: boolean; doneAt: string | null;
  dueDate: string | null; startDate: string | null; endDate: string | null; priority: number; percentDone: number; hexColor: string;
  isFavorite: boolean; position: number; repeatAfter: number; repeatMode: number; created: string; updated: string;
  labels: { id: number; title: string; description: string; hexColor: string; created: string; updated: string }[];
  reminders: { reminder: string | null; relativePeriod: number; relativeTo: string }[];
  related: Record<string, { id: number; title: string; projectId: number }[]>;
  comments: { id: number; comment: string; author: string; created: string; updated: string }[];
}
export interface VProject {
  id: number; parentId: number | null; title: string; description: string; hexColor: string; isArchived: boolean; isFavorite: boolean;
  position: number; created: string; updated: string; tasks: VTask[];
}

export interface BuildOptions {
  /** Keep relations between tasks of different projects. Older Vikunja (0.24 and before) duplicates the tasks they name, newer versions do not. */
  crossProject?: boolean;
}

export function buildVikunjaJson(user: VUser, projects: VProject[], opts: BuildOptions = {}): { data: unknown[]; droppedRelations: number } {
  const owner = { id: user.id, name: '', username: user.username, created: user.created, updated: user.created };
  const t = (v: string | null) => v ?? ZERO_TIME;
  // Older Vikunja (checked with 0.24.6) reads a project's tasks in order and looks a related task up only among the ones it has already created in
  // that project; anything else named in related_tasks is created as a NEW task, and the real one is created again later, so tasks double.
  // Vikunja adds the inverse relation itself, so each pair is written once, from the later task to the earlier one, and (unless asked) only inside a project.
  const order = new Map<number, number>();
  for (const p of projects) for (const k of p.tasks) order.set(k.id, order.size);
  const dropped = new Set<string>(); // cross-project pairs left out (each pair is seen from both ends)
  const keep = (k: VTask) => {
    const out: Record<string, { id: number; title: string; project_id: number }[]> = {};
    for (const [kind, list] of Object.entries(k.related)) {
      for (const r of list) {
        const first = (order.get(r.id) ?? Infinity) < order.get(k.id)!;
        const same = r.projectId === k.projectId;
        if (!same && !opts.crossProject) dropped.add(`${Math.min(k.id, r.id)}:${Math.max(k.id, r.id)}:${kind}`);
        else if (first) (out[kind] ??= []).push({ id: r.id, title: r.title, project_id: r.projectId });
      }
    }
    return out;
  };
  const data = projects.map((p) => ({
    id: p.id, title: p.title, description: textToHtml(p.description), identifier: '', hex_color: p.hexColor, parent_project_id: p.parentId ?? 0, owner,
    is_archived: p.isArchived, background_information: null, background_blur_hash: '', background_file_id: 0, is_favorite: p.isFavorite, position: p.position,
    views: [], buckets: [], task_buckets: [], positions: [], created: p.created, updated: p.updated,
    tasks: p.tasks.map((k) => ({
      id: k.id, title: k.title, description: textToHtml(k.description), project_id: k.projectId, done: k.done, done_at: t(k.doneAt),
      due_date: t(k.dueDate), start_date: t(k.startDate), end_date: t(k.endDate),
      reminders: k.reminders.length ? k.reminders.map((r) => ({ reminder: t(r.reminder), relative_period: r.relativePeriod, relative_to: r.relativeTo })) : null,
      repeat_after: k.repeatAfter, repeat_mode: k.repeatMode, priority: k.priority, assignees: null,
      labels: k.labels.length ? k.labels.map((l) => ({ id: l.id, title: l.title, description: l.description, hex_color: l.hexColor, created_by: owner, created: l.created, updated: l.updated })) : null,
      hex_color: k.hexColor, percent_done: k.percentDone, identifier: `#${k.index}`, index: k.index,
      related_tasks: keep(k),
      attachments: null, cover_image_attachment_id: 0, is_favorite: k.isFavorite, created: k.created, updated: k.updated, bucket_id: 0, position: k.position,
      reactions: null, created_by: owner,
      comments: k.comments.map((c) => ({ id: c.id, comment: textToHtml(c.comment), author: { ...owner, username: c.author || owner.username }, reactions: null, created: c.created, updated: c.updated })),
    })),
  }));
  return { data, droppedRelations: new Set([...dropped].map((x) => x.split(':').slice(0, 2).join(':'))).size };
}

export function buildVikunjaZip(user: VUser, projects: VProject[], opts: BuildOptions = {}): { zip: Uint8Array; droppedRelations: number } {
  const { data, droppedRelations } = buildVikunjaJson(user, projects, opts);
  return { droppedRelations, zip: zipSync({ VERSION: strToU8(EXPORT_VERSION), 'data.json': strToU8(JSON.stringify(data)) }, { level: 6 }) };
}
