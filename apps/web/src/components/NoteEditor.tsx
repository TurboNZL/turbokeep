import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare, Download, Eye, Pin, PinOff, Trash2, Undo2, X } from 'lucide-react';
import { api, ApiError, saveBlob, type Note, type NoteDetail, type Task } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { TaskPanel } from './TaskPanel.tsx';
import { TagChip } from './TagChip.tsx';

type Save = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict';

/** The list's view of a task (the checkbox, a date): derived from the whole task so the list updates the moment the editor does. */
export const toNote = (d: NoteDetail): Note => ({ ...d, task: d.task && { id: d.task.id, projectId: d.task.projectId, done: d.task.done, doneAt: d.task.doneAt, dueDate: d.task.dueDate, startDate: d.task.startDate, endDate: d.task.endDate, priority: d.task.priority, percentDone: d.task.percentDone, isFavorite: d.task.isFavorite, repeatAfter: d.task.repeatAfter, repeatMode: d.task.repeatMode } });

/**
 * One note, open: title, text, tags, pin/archive/trash, and its task when it has one. The text saves by itself (700 ms after you stop typing, when
 * the tab is hidden, when you leave); a change made on another device meanwhile is never overwritten, you choose. The note stays open while you
 * visit Settings and come back: its id is kept by the store (lib/store.ts openNote), this component only needs the id.
 */
export function NoteEditor({ id, onBack, onGone, onOpenNote }: { id: string; onBack?: () => void; onGone: () => void; onOpenNote: (id: string) => void }) {
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setDetail(null); setMissing(false);
    api.noteOrNull(id).then((d) => { if (!alive) return; if (d) setDetail(d); else setMissing(true); });
    return () => { alive = false; };
  }, [id]);
  if (missing) return <p className="p-6 text-sm text-muted">That note no longer exists. <button className="underline" onClick={onGone}>Back to the list</button></p>;
  if (!detail) return <p className="p-6 text-sm text-muted">Loading…</p>;
  return <Editor key={detail.id} note={detail} onBack={onBack} onGone={onGone} onOpenNote={onOpenNote} />;
}

function Editor({ note, onBack, onGone, onOpenNote }: { note: NoteDetail; onBack?: () => void; onGone: () => void; onOpenNote: (id: string) => void }) {
  const { settings, upsertNote, refreshMeta, tags: allTags } = useStore();
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [noteType, setNoteType] = useState(note.noteType);
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [flags, setFlags] = useState({ pinned: note.pinned, archived: note.archived, trashed: note.trashed });
  const [task, setTask] = useState<Task | null>(note.task);
  const [status, setStatus] = useState<Save>('saved');
  const [theirs, setTheirs] = useState<NoteDetail | null>(null);
  const [preview, setPreview] = useState(false);
  const base = useRef(note.updatedAt);
  const pending = useRef<Record<string, unknown> | null>(null);
  const timer = useRef<number>();
  const inflight = useRef(false);
  const theirsRef = useRef<NoteDetail | null>(null);
  theirsRef.current = theirs;
  const markdown = noteType === 'markdown';

  const flush = useCallback(async (force = false) => {
    window.clearTimeout(timer.current);
    if (inflight.current || !pending.current) return;
    const patch = pending.current; pending.current = null; inflight.current = true; setStatus('saving');
    try {
      const saved = await api.updateNote(note.id, { ...patch, base: force ? undefined : base.current });
      base.current = saved.updatedAt; upsertNote(saved);
      setStatus(pending.current ? 'dirty' : 'saved');
      if (patch.tags) void refreshMeta();
    } catch (e) {
      const typed = pending.current as Record<string, unknown> | null; // what was typed while this was in flight wins
      pending.current = { ...patch, ...(typed ?? {}) };
      if (e instanceof ApiError && e.status === 409) { setTheirs(e.body.note as NoteDetail); setStatus('conflict'); }
      else if (e instanceof ApiError && e.status === 404) onGone();
      else { setStatus('offline'); timer.current = window.setTimeout(() => void flush(), 5000); }
    } finally { inflight.current = false; }
    if (pending.current && !inflight.current && !theirsRef.current) timer.current = window.setTimeout(() => void flush(), 300);
  }, [note.id, upsertNote, refreshMeta, onGone]);

  const change = (patch: Record<string, unknown>, now = false) => {
    pending.current = { ...pending.current, ...patch };
    if (status !== 'conflict') setStatus('dirty');
    window.clearTimeout(timer.current);
    if (status !== 'conflict') timer.current = window.setTimeout(() => void flush(), now ? 0 : 700);
  };

  // save what is pending when leaving the note, hiding the tab or closing the window
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && void flush();
    const leave = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); void flush(); } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('beforeunload', leave);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('beforeunload', leave); void flush(); };
  }, [flush]);

  const setFlag = (k: keyof typeof flags, v: boolean) => { setFlags((f) => ({ ...f, [k]: v })); change({ [k]: v }, true); };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (t && !tags.includes(t)) { const next = [...tags, t]; setTags(next); change({ tags: next }, true); }
    setTagDraft('');
  };
  const dropTag = (t: string) => { const next = tags.filter((x) => x !== t); setTags(next); change({ tags: next }, true); };
  const download = () => saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${(title || 'note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.${markdown ? 'md' : 'txt'}`);
  const showPreview = markdown && (preview || settings.notePreview);
  const html = useMemo(() => (showPreview ? renderMarkdown(text) : ''), [showPreview, text]);
  const font = settings.noteFont === 'mono' ? 'mono' : '';

  /** the whole task changed (or went away): keep the list's checkbox and dates in step */
  const taskChanged = (t: Task | null) => { setTask(t); upsertNote(toNote({ ...note, title, text, noteType, tags, ...flags, task: t })); };
  async function makeTask() { try { taskChanged(await api.makeTask(note.id)); void refreshMeta(); } catch { /* the panel shows nothing yet; the note is unchanged */ } }

  const label: Record<Save, string> = { saved: 'Saved', saving: 'Saving…', dirty: 'Unsaved', offline: 'Offline: will retry', conflict: 'Changed elsewhere' };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {onBack && <button className="btn btn-ghost !px-2 md:hidden" onClick={onBack} aria-label="Back to the list"><ArrowLeft size={17} /></button>}
        <span className={cn('text-xs', status === 'saved' ? 'text-muted' : status === 'saving' || status === 'dirty' ? 'text-warn' : 'text-bad')} aria-live="polite">{label[status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!flags.trashed && !task && <button className="btn btn-ghost !px-2.5 text-sm" onClick={() => void makeTask()} title="Give this note a checkbox, dates and reminders"><CheckSquare size={16} />Make a task</button>}
          {!flags.trashed && <button className="btn btn-ghost !px-2" onClick={() => setFlag('pinned', !flags.pinned)} aria-pressed={flags.pinned} title={flags.pinned ? 'Unpin' : 'Pin'}>{flags.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
          {!flags.trashed && <button className="btn btn-ghost !px-2" onClick={() => setFlag('archived', !flags.archived)} title={flags.archived ? 'Unarchive' : 'Archive'}>{flags.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>}
          <button className="btn btn-ghost !px-2" onClick={download} title={`Download as .${markdown ? 'md' : 'txt'}`}><Download size={16} /></button>
          {flags.trashed
            ? <><button className="btn !px-2.5 text-sm" onClick={() => setFlag('trashed', false)}><Undo2 size={15} />Restore</button>
              <button className="btn !px-2.5 text-sm text-bad" onClick={async () => { if (confirm('Delete this note for good?')) { pending.current = null; await api.deleteNote(note.id); void refreshMeta(); onGone(); } }}><Trash2 size={15} />Delete forever</button></>
            : <button className="btn btn-ghost !px-2" onClick={() => setFlag('trashed', true)} title="Move to trash"><Trash2 size={16} /></button>}
        </div>
      </div>

      {status === 'conflict' && theirs && (
        <div role="alert" className="space-y-2 rounded-theme border border-warn p-3 text-sm">
          <p>This note was changed on another device ({new Date(theirs.updatedAt).toLocaleString()}) after you opened it. Your edits are not saved yet.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => { base.current = theirs.updatedAt; setTheirs(null); void flush(); }}>Keep mine</button>
            <button className="btn" onClick={() => { pending.current = null; base.current = theirs.updatedAt; setTitle(theirs.title); setText(theirs.text); setTags(theirs.tags); setNoteType(theirs.noteType); setTask(theirs.task); upsertNote(toNote(theirs)); setTheirs(null); setStatus('saved'); }}>Use theirs</button>
            <button className="btn btn-ghost" onClick={() => saveBlob(new Blob([text], { type: 'text/plain' }), 'my-version.txt')}>Save mine as a file</button>
          </div>
        </div>)}

      <input className="input !text-lg font-semibold" aria-label="Title" placeholder="Title" value={title} readOnly={flags.trashed} onChange={(e) => { setTitle(e.target.value); change({ title: e.target.value }); }} />
      {task && !flags.trashed && <TaskPanel note={{ ...note, title, text, tags }} task={task} onTask={taskChanged} onOpenNote={onOpenNote} />}
      <div className={cn('grid gap-3', showPreview && 'lg:grid-cols-2')}>
        <textarea className={cn('input note-text min-h-[45vh] w-full resize-y', font)} aria-label="Note text" placeholder="Write something…" value={text} readOnly={flags.trashed} onChange={(e) => { setText(e.target.value); change({ text: e.target.value }); }} />
        {showPreview && <div className="guide card min-h-[12rem] overflow-auto p-4" aria-label="Preview" dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted">Nothing to preview.</p>' }} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => <TagChip key={t} title={t}><button type="button" aria-label={`Remove tag ${t}`} onClick={() => dropTag(t)}><X size={11} /></button></TagChip>)}
        <input className="input !w-40" list="all-tags" aria-label="Add a tag" placeholder="Add tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); } }} onBlur={() => tagDraft && addTag(tagDraft)} />
        <datalist id="all-tags">{allTags.map((t) => <option key={t.title} value={t.title} />)}</datalist>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={markdown} onChange={(e) => { const t = e.target.checked ? 'markdown' : 'plain-text'; setNoteType(t); change({ noteType: t }, true); }} />Markdown</label>
        {markdown && !settings.notePreview && <button className="btn btn-ghost !px-2 text-xs" aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={14} />Preview</button>}
      </div>
      <p className="text-xs text-muted">Created {new Date(note.createdAt).toLocaleString()} · {text.length.toLocaleString()} characters</p>
    </div>
  );
}
