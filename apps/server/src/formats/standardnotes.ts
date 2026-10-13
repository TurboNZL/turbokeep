import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ImportError, type NoteIn, type NoteOut } from './types.ts';

/**
 * Standard Notes export, as the app writes it (packages/ui-services ArchiveManager, checked against the decrypted backups that third-party
 * converters read): a zip with
 *   Standard Notes Backup and Import File.txt     JSON { version, items: [ {uuid, content_type: Note|Tag, content: {...}} ] }
 *   Items/Note/<title>-<first 8 of uuid>.txt      one plain text file per note, only title and text
 * The JSON has the metadata (tags, pinned, archived, trashed, dates), the text files are what "plaintext export" means to most people, so we
 * write both, and read either (and a bare .txt/.md note, which is what Standard Notes' own importer accepts as well).
 */
export const BACKUP_NAME = 'Standard Notes Backup and Import File.txt';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

/** Characters a file name cannot hold on Windows, macOS or Linux. */
export const zippableName = (name: string, suffix = '', ext = 'txt') => {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120) || 'Untitled';
  return `${base}${suffix}.${ext}`;
};

const micros = (iso: string) => Math.round(new Date(iso).getTime() * 1000);

export interface SnTag { id: string; title: string; noteIds: string[]; createdAt: string; updatedAt: string }

export function buildBackupJson(notes: NoteOut[], tags: SnTag[]): string {
  const items: unknown[] = [];
  for (const n of notes) {
    items.push({
      uuid: n.id, content_type: 'Note',
      created_at: n.createdAt, updated_at: n.updatedAt, created_at_timestamp: micros(n.createdAt), updated_at_timestamp: micros(n.updatedAt),
      content: {
        title: n.title, text: n.text, noteType: n.noteType, references: [],
        preview_plain: n.text.slice(0, 160),
        appData: { 'org.standardnotes.sn': { client_updated_at: n.updatedAt } },
        ...(n.pinned ? { pinned: true } : {}), ...(n.archived ? { archived: true } : {}), ...(n.trashed ? { trashed: true } : {}),
      },
      duplicate_of: null,
    });
  }
  for (const t of tags) {
    items.push({
      uuid: t.id, content_type: 'Tag',
      created_at: t.createdAt, updated_at: t.updatedAt, created_at_timestamp: micros(t.createdAt), updated_at_timestamp: micros(t.updatedAt),
      content: { title: t.title, references: t.noteIds.map((uuid) => ({ uuid, content_type: 'Note' })), appData: { 'org.standardnotes.sn': { client_updated_at: t.updatedAt } } },
      duplicate_of: null,
    });
  }
  return JSON.stringify({ version: '004', items }, null, 2);
}

/** The zip. With `plainOnly` just the text files (no JSON), for tools that want nothing else. */
export function buildStandardNotesZip(notes: NoteOut[], tags: SnTag[], plainOnly = false): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  if (!plainOnly) files[BACKUP_NAME] = strToU8(buildBackupJson(notes, tags));
  for (const n of notes) files[`Items/Note/${zippableName(n.title, `-${n.id.split('-')[0]}`, n.noteType === 'markdown' && plainOnly ? 'md' : 'txt')}`] = strToU8(n.text);
  return zipSync(files, { level: 6 });
}

const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

/** Text of a "Super" note (a Lexical JSON tree): the words, one block per line. */
function superToText(json: string): string | null {
  try {
    const walk = (n: any): string => {
      if (!n || typeof n !== 'object') return '';
      if (typeof n.text === 'string') return n.text;
      const kids = Array.isArray(n.children) ? n.children.map(walk) : [];
      const block = ['paragraph', 'heading', 'listitem', 'quote', 'code', 'root'].includes(n.type);
      return block && n.type !== 'root' ? kids.join('') + '\n' : kids.join('');
    };
    const root = JSON.parse(json)?.root;
    return root ? walk(root).replace(/\n{3,}/g, '\n\n').trim() : null;
  } catch { return null; }
}

function fromBackup(json: any, warnings: string[]): NoteIn[] {
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  if (items.some((i) => typeof i?.content === 'string' && /^\d{3}:/.test(i.content))) {
    throw new ImportError('This is an encrypted Standard Notes backup. In Standard Notes choose Account > Data Backups > Download backup > Decrypted, then import that file.');
  }
  const tagsByNote = new Map<string, string[]>();
  for (const it of items) {
    if (it?.content_type !== 'Tag' || it.deleted) continue;
    const title = String(it.content?.title ?? '').trim();
    if (!title) continue;
    for (const ref of it.content?.references ?? []) if (ref?.content_type === 'Note' && typeof ref.uuid === 'string') tagsByNote.set(ref.uuid, [...(tagsByNote.get(ref.uuid) ?? []), title]);
  }
  const out: NoteIn[] = [];
  let supers = 0;
  for (const it of items) {
    if (it?.content_type !== 'Note' || it.deleted || !it.content) continue;
    const c = it.content;
    let text = String(c.text ?? '');
    let noteType = typeof c.noteType === 'string' && c.noteType ? c.noteType : 'plain-text';
    if (noteType === 'super') {
      supers++;
      text = superToText(text) ?? text;
      noteType = 'plain-text'; // the formatting of a Super note does not survive; its words do
    }
    out.push({
      id: isUuid(it.uuid) ? it.uuid.toLowerCase() : undefined,
      title: String(c.title ?? ''), text, noteType,
      pinned: !!c.pinned, archived: !!c.archived, trashed: !!c.trashed,
      createdAt: validDate(it.created_at), updatedAt: validDate(c.appData?.['org.standardnotes.sn']?.client_updated_at) ?? validDate(it.updated_at),
      tags: [...new Set(tagsByNote.get(it.uuid) ?? [])],
    });
  }
  if (supers) warnings.push(`${supers} Super note${supers === 1 ? '' : 's'} imported as plain text (their formatting is not kept).`);
  return out;
}

const validDate = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

const baseName = (path: string) => path.split('/').pop() ?? path;
const stripExt = (n: string) => n.replace(/\.(txt|md|markdown)$/i, '');
/** "Shopping-1fa7d986" -> "Shopping" (the suffix Standard Notes adds to tell notes with one title apart) */
const stripUuidSuffix = (n: string) => n.replace(/-[0-9a-f]{8}$/i, '');

function plainNote(path: string, data: Uint8Array, tags: string[] = []): NoteIn {
  const file = baseName(path);
  return { title: stripUuidSuffix(stripExt(file)), text: strFromU8(data), noteType: /\.(md|markdown)$/i.test(file) ? 'markdown' : 'plain-text', pinned: false, archived: false, trashed: false, tags };
}

/**
 * Reads whatever Standard Notes gives you: the decrypted zip, the JSON backup on its own, or a plain .txt/.md note.
 * `name` is the uploaded file's name (a bare text note takes its title from it).
 */
export function parseStandardNotes(name: string, data: Uint8Array): { notes: NoteIn[]; warnings: string[] } {
  const warnings: string[] = [];
  if (isZip(data)) {
    let entries: Record<string, Uint8Array>;
    try { entries = unzipSync(data); } catch { throw new ImportError('That file looks like a zip but cannot be opened.'); }
    const paths = Object.keys(entries).filter((p) => !p.endsWith('/') && !p.startsWith('__MACOSX/'));
    // the JSON backup sits at the top of the zip; its extension has varied (.txt, .json, none)
    for (const p of paths.filter((x) => !x.includes('/') && !/\.(md|markdown)$/i.test(x))) {
      const text = strFromU8(entries[p]!);
      if (!text.trimStart().startsWith('{')) continue;
      try { const j = JSON.parse(text); if (Array.isArray(j?.items)) return { notes: fromBackup(j, warnings), warnings }; } catch { /* not the backup */ }
    }
    const textFiles = paths.filter((p) => /\.(txt|md|markdown)$/i.test(p));
    if (!textFiles.length) throw new ImportError('No Standard Notes backup or text notes found in that zip.');
    warnings.push('No JSON backup in the zip, so notes came in without tags, dates, pins or archive state.');
    return {
      warnings,
      notes: textFiles.map((p) => {
        // other exporters sort notes into folders per tag (<tag>/<title>.txt); Standard Notes' own Items/Note/ folder is not a tag
        const dirs = p.split('/').slice(0, -1);
        const tag = dirs[0] === 'Items' ? [] : dirs.length ? [dirs.join('.')] : [];
        return plainNote(p, entries[p]!, tag);
      }),
    };
  }
  const head = strFromU8(data.subarray(0, 64)).trimStart();
  if (head.startsWith('{')) {
    let j: any;
    try { j = JSON.parse(strFromU8(data)); } catch { throw new ImportError('That file is not valid JSON.'); }
    if (Array.isArray(j?.items)) return { notes: fromBackup(j, warnings), warnings };
    throw new ImportError('That JSON is not a Standard Notes backup (no "items").');
  }
  return { notes: [plainNote(name || 'Untitled.txt', data)], warnings };
}
