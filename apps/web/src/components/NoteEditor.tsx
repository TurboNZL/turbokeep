import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, CheckCircle2, Download, Eye, Link2, Pin, PinOff, RotateCcw, Tags, Trash2, Undo2 } from 'lucide-react';
import { api, ApiError, saveBlob, type Note, type NotePatch } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { toLocalInput } from '../lib/dates.ts';
import { copyNoteLink, excerpt, patchNote } from '../lib/actions.ts';
import { linkedNotes } from '../lib/clip.ts';
import { TagInput } from './TagInput.tsx';
import { TagPicker } from './TagPicker.tsx';

type Save = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict';
type Meta = Pick<Note, 'pinned' | 'archived' | 'trashed' | 'onList' | 'dueDate' | 'percentDone' | 'tags'>;
const metaOf = (n: Note): Meta => ({ pinned: n.pinned, archived: n.archived, trashed: n.trashed, onList: n.onList, dueDate: n.dueDate, percentDone: n.percentDone, tags: n.tags });

/**
 * One item, open: title, text, tags, date, progress, and the buttons (pin, finish, link, download, bin). The title and text save by themselves
 * (700 ms after you stop typing, when the tab is hidden, when you leave); a change made on another device meanwhile is never overwritten, you choose.
 * Everything else (pin, finish, tags, date...) is saved at once and is not part of that, so the list and the editor can both change a note while you type.
 */
export function NoteEditor({ id, onBack, onGone, onOpenNote, startPicking, onPicked }: { id: string; onBack?: () => void; onGone: () => void; onOpenNote: (id: string) => void; /** open the tag picker at once (the widget's "Save to memory") */ startPicking?: boolean; onPicked?: () => void }) {
  const [detail, setDetail] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setDetail(null); setMissing(false);
    api.noteOrNull(id).then((d) => { if (!alive) return; if (d) setDetail(d); else setMissing(true); });
    return () => { alive = false; };
  }, [id]);
  if (missing) return <p className="p-6 text-sm text-muted">That note no longer exists. <button className="underline" onClick={onGone}>Back to the list</button></p>;
  if (!detail) return <p className="p-6 text-sm text-muted">Loading…</p>;
  return <Editor key={detail.id} note={detail} onBack={onBack} onGone={onGone} onOpenNote={onOpenNote} startPicking={startPicking} onPicked={onPicked} />;
}

function Editor({ note, onBack, onGone, onOpenNote, startPicking, onPicked }: { note: Note; onBack?: () => void; onGone: () => void; onOpenNote: (id: string) => void; startPicking?: boolean; onPicked?: () => void }) {
  const settings = useStore((s) => s.settings);
  const replaceNote = useStore((s) => s.replaceNote);
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [noteType, setNoteType] = useState(note.noteType);
  const [meta, setMeta] = useState<Meta>(metaOf(note));
  const [status, setStatus] = useState<Save>('saved');
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [preview, setPreview] = useState(false);
  const [picking, setPicking] = useState(!!startPicking);
  useEffect(() => { if (startPicking) onPicked?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useRef(note.updatedAt);
  const pending = useRef<{ title?: string; text?: string; noteType?: string } | null>(null);
  const timer = useRef<number>();
  const firstTyped = useRef(0); // when the oldest unsaved keystroke happened: a long burst of typing is still saved every few seconds
  const inflight = useRef(false);
  const theirsRef = useRef<Note | null>(null); theirsRef.current = theirs;
  const gone = useRef(onGone); gone.current = onGone; // a new function each render must not restart the saving below
  const markdown = noteType === 'markdown';

  // pin, finish, tags... changed from the list while this is open: show them here too
  const live = useStore((s) => s.notes.find((n) => n.id === note.id));
  useEffect(() => { if (live) setMeta(metaOf(live)); }, [live?.pinned, live?.archived, live?.trashed, live?.onList, live?.dueDate, live?.percentDone, live?.tags.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async (force = false) => {
    window.clearTimeout(timer.current);
    if (inflight.current || !pending.current) return;
    const patch = pending.current; pending.current = null; firstTyped.current = 0; inflight.current = true; setStatus('saving');
    try {
      const saved = await api.updateNote(note.id, { ...patch, base: force ? undefined : base.current });
      base.current = saved.updatedAt; replaceNote(excerpt(saved));
      setStatus(pending.current ? 'dirty' : 'saved');
    } catch (e) {
      pending.current = { ...patch, ...(pending.current ?? {}) }; // what was typed while this was in flight wins
      if (e instanceof ApiError && e.status === 409) { setTheirs(e.body.note as Note); setStatus('conflict'); }
      else if (e instanceof ApiError && e.status === 404) gone.current();
      else { setStatus('offline'); timer.current = window.setTimeout(() => void flush(), 5000); }
    } finally { inflight.current = false; }
    if (pending.current && !theirsRef.current) timer.current = window.setTimeout(() => void flush(), 300);
  }, [note.id, replaceNote]);

  const typed = (patch: { title?: string; text?: string; noteType?: string }, now = false) => {
    if (!pending.current) firstTyped.current = Date.now();
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    if (theirsRef.current) return;
    setStatus((s) => (s === 'conflict' ? s : 'dirty'));
    timer.current = window.setTimeout(() => void flush(), now ? 0 : Math.max(0, Math.min(700, firstTyped.current + 4000 - Date.now())));
  };

  // save what is pending when leaving the note, hiding the tab or closing the window (set up once: nothing above may change on a re-render)
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && void flush();
    const leave = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); void flush(); } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('beforeunload', leave);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('beforeunload', leave); void flush(); };
  }, [flush]);

  /** everything that is not the title or the text: saved at once, and the list is updated by the same call */
  const set = (patch: NotePatch) => { setMeta((m) => ({ ...m, ...patch } as Meta)); void patchNote(note.id, patch); };
  const download = () => {
    saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${(title || 'note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.${markdown ? 'md' : 'txt'}`);
  };
  const showPreview = markdown && (preview || settings.notePreview);
  const html = useMemo(() => (showPreview ? renderMarkdown(text) : ''), [showPreview, text]);
  const links = useMemo(() => linkedNotes(text).filter((x) => x !== note.id), [text, note.id]);
  const font = settings.noteFont === 'mono' ? 'mono' : '';
  const ro = meta.trashed;
  const label: Record<Save, string> = { saved: 'Saved', saving: 'Saving…', dirty: 'Typing…', offline: 'Offline: will retry', conflict: 'Changed elsewhere' };
  const pct = Math.round(meta.percentDone * 100);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {onBack && <button className="btn btn-ghost !px-2 md:hidden" onClick={onBack} aria-label="Back to the list"><ArrowLeft size={18} /></button>}
        <span className={cn('text-xs', status === 'saved' ? 'text-muted' : status === 'saving' || status === 'dirty' ? 'text-warn' : 'text-bad')} aria-live="polite">{label[status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!ro && <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => set({ pinned: !meta.pinned })} aria-pressed={meta.pinned} title={meta.pinned ? 'Unpin' : 'Pin to the top'}>{meta.pinned ? <PinOff size={17} /> : <Pin size={17} />}</button>}
          {!ro && <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => set({ archived: !meta.archived })} title={meta.archived ? (meta.onList ? 'Reopen' : 'Unarchive') : (meta.onList ? 'Finish' : 'Archive')}>{meta.archived ? <ArchiveRestore size={17} /> : meta.onList ? <CheckCircle2 size={17} /> : <Archive size={17} />}</button>}
          <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => void copyNoteLink(note.id)} title="Copy a link to this note (paste it into another note)"><Link2 size={17} /></button>
          <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={download} title={`Download as .${markdown ? 'md' : 'txt'}`}><Download size={17} /></button>
          {ro
            ? <><button className="btn !min-h-10 !px-2.5 text-sm" onClick={() => set({ trashed: false })}><Undo2 size={15} />Restore</button>
              <button className="btn !min-h-10 !px-2.5 text-sm text-bad" onClick={async () => { if (confirm('Delete this note for good?')) { pending.current = null; await api.deleteNote(note.id); void useStore.getState().refreshMeta(); useStore.getState().removeNote(note.id); onGone(); } }}><Trash2 size={15} />Delete forever</button></>
            : <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => { set({ trashed: true }); onGone(); }} title="Move to the bin"><Trash2 size={17} /></button>}
        </div>
      </div>

      {status === 'conflict' && theirs && (
        <div role="alert" className="space-y-2 rounded-theme border border-warn p-3 text-sm">
          <p>This note was changed on another device ({new Date(theirs.updatedAt).toLocaleString()}) after you opened it. Your edits are not saved yet.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => { base.current = theirs.updatedAt; setTheirs(null); void flush(); }}>Keep mine</button>
            <button className="btn" onClick={() => { pending.current = null; base.current = theirs.updatedAt; setTitle(theirs.title); setText(theirs.text); setNoteType(theirs.noteType); setMeta(metaOf(theirs)); replaceNote(excerpt(theirs)); setTheirs(null); setStatus('saved'); }}>Use theirs</button>
            <button className="btn btn-ghost" onClick={() => saveBlob(new Blob([text], { type: 'text/plain' }), 'my-version.txt')}>Save mine as a file</button>
          </div>
        </div>)}

      <input className="input !min-h-12 !text-lg font-semibold" aria-label="Title" placeholder="Title" value={title} readOnly={ro} onChange={(e) => { setTitle(e.target.value); typed({ title: e.target.value }); }} />
      <div className={cn('grid gap-3', showPreview && 'lg:grid-cols-2')}>
        <textarea className={cn('input note-text min-h-[38vh] w-full resize-y', font)} aria-label="Description" placeholder="Description, notes, anything…" value={text} readOnly={ro} onChange={(e) => { setText(e.target.value); typed({ text: e.target.value }); }} />
        {showPreview && <div className="guide card min-h-[12rem] overflow-auto p-4" aria-label="Preview" dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted">Nothing to preview.</p>' }}
          onClick={(e) => { const a = (e.target as HTMLElement).closest('a'); const m = a && /\/home\/([0-9a-f-]{36})/i.exec(a.getAttribute('href') ?? ''); if (a && m && a.href.startsWith(location.origin)) { e.preventDefault(); onOpenNote(m[1]!.toLowerCase()); } }} />}
      </div>
      {links.length > 0 && <LinkedNotes ids={links} onOpen={onOpenNote} />}

      {!ro && (
        <div className="card space-y-3 p-3">
          <div className="space-y-1.5"><span className="text-xs font-medium text-muted">Tags</span><TagInput value={meta.tags} onChange={(tags) => set({ tags })} /></div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={meta.onList} onChange={(e) => set({ onList: e.target.checked })} />On my task list <span className="text-xs text-muted">(has a checkbox on Home)</span></label>
            <label className="flex items-center gap-2 text-sm">Due
              <input type="date" className="input !w-auto" value={toLocalInput(meta.dueDate).slice(0, 10)} onChange={(e) => set({ dueDate: e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null })} />
              {meta.dueDate && <button type="button" className="btn btn-ghost !px-2 text-xs" onClick={() => set({ dueDate: null })}><RotateCcw size={13} />Clear</button>}</label>
          </div>
          {meta.onList && <label className="flex items-center gap-3 text-sm">Progress
            <input type="range" className="bt-range bt-hit min-w-0 flex-1" min={0} max={100} step={5} value={pct} style={{ '--p': `${pct}%` } as CSSProperties} aria-label={`Progress: ${pct}%`} onChange={(e) => setMeta((m) => ({ ...m, percentDone: Number(e.target.value) / 100 }))}
              onPointerUp={() => set({ percentDone: meta.percentDone })} onKeyUp={() => set({ percentDone: meta.percentDone })} onBlur={() => set({ percentDone: meta.percentDone })} />
            <span className="w-10 text-right tabular-nums">{pct}%</span></label>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn !min-h-11" onClick={() => setPicking(true)}><Tags size={16} />Send to tags</button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={markdown} onChange={(e) => { const t = e.target.checked ? 'markdown' : 'plain-text'; setNoteType(t); typed({ noteType: t }, true); }} />Markdown</label>
            {markdown && !settings.notePreview && <button className="btn btn-ghost !px-2 text-xs" aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={14} />Preview</button>}
          </div>
        </div>)}
      <p className="text-xs text-muted">Created {new Date(note.createdAt).toLocaleString()} · {text.length.toLocaleString()} characters</p>
      {picking && <TagPicker initial={meta.tags} keepOnList={meta.tags.length ? meta.onList : false} title="Send to tags" onClose={() => setPicking(false)}
        onDone={(tags, keep) => { setPicking(false); set({ tags, onList: tags.length ? keep : meta.onList }); }} />}
    </div>
  );
}

/** The notes this one links to (a link is pasted into the text: "Copy link" in a note's menu). */
function LinkedNotes({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const list = useStore((s) => s.notes);
  const [titles, setTitles] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    for (const id of ids) if (!list.some((n) => n.id === id) && !(id in titles)) api.noteOrNull(id).then((n) => alive && setTitles((t) => ({ ...t, [id]: n ? n.title.trim() || n.text.split('\n')[0]?.slice(0, 60) || 'Untitled' : null })));
    return () => { alive = false; };
  }, [ids.join(','), list]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Linked notes"><span className="text-xs text-muted">Links to</span>
      {ids.map((id) => {
        const n = list.find((x) => x.id === id), t = n ? n.title.trim() || n.text.split('\n')[0]?.slice(0, 60) || 'Untitled' : titles[id];
        return t === null ? <span key={id} className="chip text-muted line-through">missing note</span> : <button key={id} className="chip hover:border-accent" onClick={() => onOpen(id)}><Link2 size={12} className="mr-1 inline" />{t ?? '…'}</button>;
      })}
    </div>
  );
}
