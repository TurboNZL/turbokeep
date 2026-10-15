import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { BACKUP_NAME, buildStandardNotesZip, parseStandardNotes, zippableName } from './formats/standardnotes.ts';
import { buildVikunjaZip, htmlToText, parseVikunja, textToHtml, ZERO_TIME } from './formats/vikunja.ts';
import { ImportError, type NoteOut } from './formats/types.ts';

const note = (o: Partial<NoteOut> = {}): NoteOut => ({ id: '1fa7d986-e8f7-4121-bcf2-7f408c85ed03', title: 'Shopping', text: 'milk\neggs', noteType: 'plain-text', pinned: true, archived: false, trashed: false, createdAt: '2024-01-02T03:04:05.000Z', updatedAt: '2024-02-03T04:05:06.000Z', tags: ['home'], ...o });

describe('Standard Notes', () => {
  it('writes the layout the app writes: JSON backup plus Items/Note/<title>-<uuid8>.txt', () => {
    const files = unzipSync(buildStandardNotesZip([note()], [{ id: 't1', title: 'home', noteIds: [note().id], createdAt: note().createdAt, updatedAt: note().createdAt }]));
    expect(Object.keys(files).sort()).toEqual([BACKUP_NAME, 'Items/Note/Shopping-1fa7d986.txt'].sort());
    expect(strFromU8(files['Items/Note/Shopping-1fa7d986.txt']!)).toBe('milk\neggs');
    const j = JSON.parse(strFromU8(files[BACKUP_NAME]!));
    expect(j.version).toBe('004');
    expect(j.items[0]).toMatchObject({ uuid: note().id, content_type: 'Note', content: { title: 'Shopping', text: 'milk\neggs', pinned: true } });
    expect(j.items[1]).toMatchObject({ content_type: 'Tag', content: { title: 'home', references: [{ uuid: note().id, content_type: 'Note' }] } });
  });

  it('plain-only has no JSON', () => {
    expect(Object.keys(unzipSync(buildStandardNotesZip([note()], [], true)))).toEqual(['Items/Note/Shopping-1fa7d986.txt']);
  });

  it('round-trips everything the JSON carries', () => {
    const tag = { id: 't1', title: 'home', noteIds: [note().id], createdAt: note().createdAt, updatedAt: note().createdAt };
    const { notes } = parseStandardNotes('x.zip', buildStandardNotesZip([note(), note({ id: '2fa7d986-e8f7-4121-bcf2-7f408c85ed03', title: 'Old', archived: true, trashed: true, pinned: false, tags: [] })], [tag]));
    expect(notes[0]).toMatchObject({ id: note().id, title: 'Shopping', text: 'milk\neggs', pinned: true, tags: ['home'], createdAt: note().createdAt, updatedAt: note().updatedAt });
    expect(notes[1]).toMatchObject({ archived: true, trashed: true });
  });

  it('reads a real-looking third-party backup (trashed flag, client_updated_at, nested tag)', () => {
    const json = { version: '004', items: [
      { uuid: '1fa7d986-e8f7-4121-bcf2-7f408c85ed03', content_type: 'Note', content: { title: 'personal-todo', text: '## Title', references: [], appData: { 'org.standardnotes.sn': { client_updated_at: '2014-05-30T15:39:59.000Z' } }, trashed: true }, created_at: '2014-05-30T15:39:59.000Z', updated_at: '2021-02-20T18:20:24.915Z', duplicate_of: null },
      { uuid: '321a849e-d854-4cc4-808d-6aa0b80bceb8', content_type: 'Tag', content: { title: 'personal.prose', references: [{ uuid: '1fa7d986-e8f7-4121-bcf2-7f408c85ed03', content_type: 'Note' }] } },
      { uuid: 'x', content_type: 'SN|Component', content: {} },
    ] };
    const { notes } = parseStandardNotes('Standard Notes Backup and Import File.txt', strToU8(JSON.stringify(json)));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: 'personal-todo', trashed: true, tags: ['personal.prose'], updatedAt: '2014-05-30T15:39:59.000Z' });
  });

  it('refuses an encrypted backup with instructions', () => {
    const enc = { version: '004', items: [{ uuid: 'a', content_type: 'Note', content: '004:abcdef', enc_item_key: '004:x' }] };
    expect(() => parseStandardNotes('b.txt', strToU8(JSON.stringify(enc)))).toThrow(/Decrypted/);
  });

  it('reads a zip that only has text files (titles lose the uuid suffix, folders become tags)', () => {
    const zip = zipSync({ 'Items/Note/Plan-1fa7d986.txt': strToU8('a'), 'work/Idea.md': strToU8('# b'), '__MACOSX/x.txt': strToU8('junk') });
    const { notes, warnings } = parseStandardNotes('n.zip', zip);
    expect(notes.map((n) => [n.title, n.tags, n.noteType])).toEqual([['Plan', [], 'plain-text'], ['Idea', ['work'], 'markdown']]);
    expect(warnings[0]).toMatch(/without tags/);
  });

  it('reads a single .txt note, named by its file', () => {
    expect(parseStandardNotes('Meeting notes.txt', strToU8('hello')).notes[0]).toMatchObject({ title: 'Meeting notes', text: 'hello' });
  });

  it('turns a Super note into its words', () => {
    const lexical = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'Second' }] }] } };
    const json = { items: [{ uuid: '1fa7d986-e8f7-4121-bcf2-7f408c85ed03', content_type: 'Note', content: { title: 'S', text: JSON.stringify(lexical), noteType: 'super' } }] };
    const r = parseStandardNotes('b.txt', strToU8(JSON.stringify(json)));
    expect(r.notes[0]!.text).toBe('Hello world\nSecond');
    expect(r.warnings[0]).toMatch(/Super/);
  });

  it('makes safe file names', () => {
    expect(zippableName('a/b:c*?', '-12345678')).toBe('a_b_c__-12345678.txt');
    expect(zippableName('')).toBe('Untitled.txt');
  });
});

describe('Vikunja', () => {
  const user = { id: 1, username: 'me', created: '2024-01-01T00:00:00.000Z' };
  const task = (o: any = {}) => ({ id: 10, index: 1, title: 'Pay rent', description: 'soon\nvery soon\n\nsecond <b> paragraph & more', done: false, doneAt: null, dueDate: '2030-05-01T09:00:00.000Z', percentDone: 0.5, isFavorite: true, position: 65536, created: '2024-01-01T00:00:00.000Z', updated: '2024-01-02T00:00:00.000Z', labels: [{ id: 1, title: 'money', hexColor: '00ff00', created: '2024-01-01T00:00:00.000Z', updated: '2024-01-01T00:00:00.000Z' }], ...o });
  const project = (tasks: any[] = [task()]) => ({ id: 1, title: 'TurboKeep', created: '2024-01-01T00:00:00.000Z', updated: '2024-01-01T00:00:00.000Z', tasks });

  it('writes VERSION and data.json with Vikunja\'s field names and zero times', () => {
    const files = unzipSync(buildVikunjaZip(user, project([task({ dueDate: null }), task({ id: 11, title: 'Find cheque book', done: true, doneAt: '2024-02-02T00:00:00.000Z', labels: [] })])));
    expect(Object.keys(files).sort()).toEqual(['VERSION', 'data.json']);
    expect(strFromU8(files.VERSION!)).toBe('1.0.0');
    const data = JSON.parse(strFromU8(files['data.json']!));
    expect(data).toHaveLength(1);
    const t = data[0].tasks[0];
    expect(data[0]).toMatchObject({ id: 1, title: 'TurboKeep', parent_project_id: 0, is_archived: false });
    expect(t).toMatchObject({ id: 10, title: 'Pay rent', project_id: 1, due_date: ZERO_TIME, done_at: ZERO_TIME, priority: 0, percent_done: 0.5, repeat_after: 0, identifier: '#1', is_favorite: true, related_tasks: {} });
    expect(t.labels[0]).toMatchObject({ title: 'money', hex_color: '00ff00' });
    expect(data[0].tasks[1]).toMatchObject({ done: true, done_at: '2024-02-02T00:00:00.000Z', labels: null, reminders: null });
  });

  it('reads back what it wrote', () => {
    const { projects } = parseVikunja(buildVikunjaZip(user, project()));
    expect(projects[0]).toMatchObject({ oldId: 1, title: 'TurboKeep', parentOldId: null });
    expect(projects[0]!.tasks[0]).toMatchObject({ oldId: 10, title: 'Pay rent', description: 'soon\nvery soon\n\nsecond <b> paragraph & more', dueDate: '2030-05-01T09:00:00.000Z', doneAt: null, startDate: null, priority: 0, labels: [{ title: 'money', hexColor: '00ff00' }], reminders: [], comments: [], related: {} });
  });

  it('reads Vikunja\'s own shapes: zero dates, nested children, favorites pseudo project, attachments', () => {
    const raw = [
      { id: -1, title: 'Favorites', tasks: [{ id: 1, title: 'dup' }] },
      { id: 5, title: 'Work', parent_project_id: 0, hex_color: '#ABCDEF', is_archived: true, tasks: [{ id: 7, title: 'Ship', done: true, done_at: '2024-03-01T10:00:00Z', due_date: '0001-01-01T00:00:00Z', priority: 9, labels: null, reminders: null, attachments: [{ id: 1 }, { id: 2 }], related_tasks: {} }, { id: 8, title: '' }],
        child_projects: [{ id: 6, title: 'Sub', tasks: [] }] },
    ];
    const { projects, warnings } = parseVikunja(strToU8(JSON.stringify(raw)));
    expect(projects.map((p) => [p.oldId, p.parentOldId, p.isArchived])).toEqual([[5, null, true], [6, 5, false]]);
    expect(projects[0]!.hexColor).toBe('abcdef');
    expect(projects[0]!.tasks).toHaveLength(1);
    expect(projects[0]!.tasks[0]).toMatchObject({ dueDate: null, done: true, priority: 5 });
    expect(warnings[0]).toMatch(/2 attachments/);
  });

  it('rejects things that are not exports', () => {
    expect(() => parseVikunja(zipSync({ 'readme.txt': strToU8('x') }))).toThrow(ImportError);
    expect(() => parseVikunja(strToU8('{"a":1}'))).toThrow(/list of projects/);
    expect(() => parseVikunja(strToU8('[]'))).toThrow(/No projects/);
  });
});

describe('descriptions', () => {
  it('flattens Vikunja\'s HTML to text', () => {
    expect(htmlToText('<p>Hello <strong>big</strong> &amp; small</p><ul><li><p>one</p></li><li>two<br>lines</li></ul><p>See <a href="https://x.test/a?b=1&amp;c=2">the page</a></p>'))
      .toBe('Hello big & small\n\n- one\n\n- two\nlines\n\nSee the page (https://x.test/a?b=1&c=2)');
    expect(htmlToText('<ul data-type="taskList"><li data-checked="true">done</li><li data-checked="false">todo</li></ul>')).toBe('[x] done\n[ ] todo');
    expect(htmlToText('plain, no tags: 1 < 2')).toBe('plain, no tags: 1 < 2');
    expect(htmlToText('')).toBe('');
  });
  it('wraps text in paragraphs and survives the round trip, tags in the text included', () => {
    const t = 'a & b\nsecond line\n\n<script>alert(1)</script>';
    expect(textToHtml(t)).toBe('<p>a &amp; b<br>second line</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(htmlToText(textToHtml(t))).toBe(t);
    expect(textToHtml('')).toBe('');
  });
});
