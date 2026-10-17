import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, CheckCircle2, Download, Link2, ListChecks, Pin, PinOff, Tags, Trash2, Undo2, X } from 'lucide-react';
import { api, ApiError, saveBlob, type Note, type NotePatch } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { toLocalInput } from '../lib/dates.ts';
import { copyNoteLink, excerpt, patchNote } from '../lib/actions.ts';
import { linkedNotes } from '../lib/clip.ts';
import { TagInput } from './TagInput.tsx';
import { TagPicker } from './TagPicker.tsx';
import { AutoText } from './AutoText.tsx';
import { DatePicker } from './DatePicker.tsx';
import { titleOverflow } from '../lib/title.ts';
import { recallNote, rememberNote } from '../lib/cache.ts';
import { takeEditorFocus, takeTypeAhead, peekTypeAhead } from '../lib/focus.ts';

type Save = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict';
type Meta = Pick<Note, 'pinned' | 'archived' | 'trashed' | 'onList' | 'dueDate' | 'percentDone' | 'tags'>;
const metaOf = (n: Note): Meta => ({ pinned: n.pinned, archived: n.archived, trashed: n.trashed, onList: n.onList, dueDate: n.dueDate, percentDone: n.percentDone, tags: n.tags });

/**
 * One item, open: title, text, tags, date, progress, and the buttons (pin, finish, link, download, bin). The title and text save by themselves
 * (700 ms after you stop typing, when the tab is hidden, when you leave); a change made on another device meanwhile is never overwritten, you choose.
 * Everything else (pin, finish, tags, date...) is saved at once and is not part of that, so the list and the editor can both change a note while you type.
 */
export function NoteEditor({ id, onBack, onGone, onOpenNote, startPicking, onPicked }: { id: string; onBack?: () => void; onGone: () => void; onOpenNote: (id: string) => void; /** open the tag picker at once (the widget's "Save to memory") */ startPicking?: boolean; onPicked?: () => void }) {
  const [detail, setDetail] = useState<Note | null>(() => recallNote<Note>(id) ?? null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    // a copy kept from before opens at once; the server is asked anyway (a change made elsewhere shows up as the usual "changed elsewhere" choice, never as a silent overwrite)
    const hit = recallNote<Note>(id);
    setDetail(hit ?? null); setMissing(false);
    api.noteOrNull(id).then((d) => { if (!alive) return; if (d) { rememberNote(d); if (!hit) setDetail(d); } else setMissing(true); });
    return () => { alive = false; };
  }, [id]);
  if (missing) return <p className="p-6 text-sm text-muted">That note no longer exists. <button className="underline" onClick={onGone}>Back to the list</button></p>;
  if (!detail) return <EditorSkeleton />;
  return <Editor key={detail.id} note={detail} onBack={onBack} onGone={onGone} onOpenNote={onOpenNote} startPicking={startPicking} onPicked={onPicked} />;
}

/** What shows while the note is fetched: the same blocks, the same sizes as the editor, so nothing jumps when the note arrives (a one-line "Loading…" made the panel snap to full size halfway through opening). */
function EditorSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading the note">
      <div className="flex h-10 items-center gap-1.5"><span className="h-3 w-12 animate-pulse rounded bg-raised" /><span className="ml-auto h-6 w-40 animate-pulse rounded bg-raised" /></div>
      <div className="input !min-h-12 animate-pulse" aria-hidden />
      <div className="input min-h-[5.5rem] animate-pulse" aria-hidden />
      <div className="card h-[15.1rem] animate-pulse" aria-hidden />
      <div className="h-4 w-48 animate-pulse rounded bg-raised" aria-hidden />
    </div>
  );
}

function Editor({ note, onBack, onGone, onOpenNote, startPicking, onPicked }: { note: Note; onBack?: () => void; onGone: () => void; onOpenNote: (id: string) => void; startPicking?: boolean; onPicked?: () => void }) {
  const settings = useStore((s) => s.settings);
  const replaceNote = useStore((s) => s.replaceNote);
  // letters typed into the add box before this editor existed (see lib/focus.ts) are already in its title
  const early = useRef<string | null>(null); if (early.current === null) early.current = peekTypeAhead(note.id); // (only looked at here: it is taken once this editor is really on screen)
  const [title, setTitle] = useState(note.title + early.current);
  const [text, setText] = useState(note.text);
  const [noteType, setNoteType] = useState(note.noteType);
  const [meta, setMeta] = useState<Meta>(metaOf(note));
  const [status, setStatus] = useState<Save>('saved');
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [editing, setEditing] = useState(note.noteType !== 'markdown' || !note.text.trim()); // a Markdown note shows its rendering until you click into it
  const descEl = useRef<HTMLTextAreaElement>(null);
  const titleEl = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (takeEditorFocus(note.id)) { const t = titleEl.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const caret = useRef<number | null>(null); // where typing goes on in the description (after an over-long title moved there, or when a rendered note was clicked)
  useEffect(() => { if (caret.current !== null && descEl.current) { const c = caret.current; caret.current = null; descEl.current.focus(); descEl.current.setSelectionRange(c, c); } });
  const [picking, setPicking] = useState(!!startPicking && !note.tags.length);
  // the widget's "Send to tags": an item that has tags goes straight to them, one without asks which
  useEffect(() => { if (startPicking) { onPicked?.(); if (note.tags.length && note.onList) set({ onList: false }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useRef(note.updatedAt);
  const pending = useRef<{ title?: string; text?: string; noteType?: string; autoTitle?: boolean } | null>(null);
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
      base.current = saved.updatedAt; replaceNote(excerpt(saved)); rememberNote(saved);
      setStatus(pending.current ? 'dirty' : 'saved');
    } catch (e) {
      pending.current = { ...patch, ...(pending.current ?? {}) }; // what was typed while this was in flight wins
      if (e instanceof ApiError && e.status === 409) { setTheirs(e.body.note as Note); setStatus('conflict'); }
      else if (e instanceof ApiError && e.status === 404) gone.current();
      else { setStatus('offline'); timer.current = window.setTimeout(() => void flush(), 5000); }
    } finally { inflight.current = false; }
    if (pending.current && !theirsRef.current) timer.current = window.setTimeout(() => void flush(), 300);
  }, [note.id, replaceNote]);

  const typed = (patch: { title?: string; text?: string; noteType?: string; autoTitle?: boolean }, now = false) => {
    if (!pending.current) firstTyped.current = Date.now();
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    if (theirsRef.current) return;
    setStatus((s) => (s === 'conflict' ? s : 'dirty'));
    timer.current = window.setTimeout(() => void flush(), now ? 0 : Math.max(0, Math.min(700, firstTyped.current + 4000 - Date.now())));
  };

  // ... and letters that arrive after it is on screen are added to the end of the title
  const titleNow = useRef(title); titleNow.current = title;
  useEffect(() => {
    const apply = () => { const s = takeTypeAhead(note.id); if (s) { const t = titleNow.current + s; titleNow.current = t; setTitle(t); typed({ title: t }); } };
    const had = early.current ?? '', now = takeTypeAhead(note.id);
    if (now.length > had.length) { const t = titleNow.current + now.slice(had.length); titleNow.current = t; setTitle(t); typed({ title: t }); } else if (had) typed({ title: titleNow.current });
    window.addEventListener('tk:typeahead', apply);
    return () => window.removeEventListener('tk:typeahead', apply);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const split = markdown && settings.markdownSplit; // the editor and the rendering side by side (Settings > Items)
  const ro = meta.trashed;
  const showEditor = !markdown || split || editing;
  const showPreview = markdown && (split || !showEditor);
  const html = useMemo(() => (showPreview ? renderMarkdown(text) : ''), [showPreview, text]);
  const links = useMemo(() => linkedNotes(text).filter((x) => x !== note.id), [text, note.id]);
  const font = settings.noteFont === 'mono' ? 'mono' : '';
  const label: Record<Save, string> = { saved: 'Saved', saving: 'Saving…', dirty: 'Typing…', offline: 'Offline: will retry', conflict: 'Changed elsewhere' };
  const pct = Math.round(meta.percentDone * 100);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {onBack && <button className="btn btn-ghost !px-2 md:hidden" onClick={onBack} aria-label="Back to the list"><ArrowLeft size={18} /></button>}
        <span className={cn('text-xs', status === 'saved' ? 'text-muted' : status === 'saving' || status === 'dirty' ? 'text-warn' : 'text-bad')} aria-live="polite">{label[status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!ro && <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => set({ pinned: !meta.pinned })} aria-pressed={meta.pinned} title={meta.pinned ? 'Unpin' : 'Pin to the top'}>{meta.pinned ? <PinOff size={17} /> : <Pin size={17} />}</button>}
          {!ro && <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => set({ archived: !meta.archived })} title={meta.archived ? 'Unarchive' : 'Archive'}>{meta.archived ? <ArchiveRestore size={17} /> : meta.onList ? <CheckCircle2 size={17} /> : <Archive size={17} />}</button>}
          <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => void copyNoteLink(note.id)} title="Copy a link to this note (paste it into another note)"><Link2 size={17} /></button>
          <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={download} title={`Download as .${markdown ? 'md' : 'txt'}`}><Download size={17} /></button>
          {ro
            ? <><button className="btn !min-h-10 !px-2.5 text-sm" onClick={() => set({ trashed: false })}><Undo2 size={15} />Restore</button>
              <button className="btn !min-h-10 !px-2.5 text-sm text-bad" onClick={async () => { if (confirm('Delete this note for good?')) { pending.current = null; await api.deleteNote(note.id); void useStore.getState().refreshMeta(); useStore.getState().removeNote(note.id); onGone(); } }}><Trash2 size={15} />Delete forever</button></>
            : <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={() => { set({ trashed: true }); onGone(); }} title="Move to the bin"><Trash2 size={17} /></button>}
        
          {onBack && <button className="btn btn-ghost !min-h-10 !px-2.5" onClick={onBack} aria-label="Close the editor" title="Close the editor"><X size={18} /></button>}
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

      <AutoText ref={titleEl} className="input !min-h-12 resize-none !py-2.5 !text-lg font-semibold" aria-label="Title" placeholder="Title (Enter starts a new line)" value={title} readOnly={ro}
        onChange={(e) => {
          const o = titleOverflow(e.target.value, text, e.target.selectionStart);
          if (!o) { setTitle(e.target.value); typed({ title: e.target.value }); return; }
          setTitle(o.title); setText(o.text); setEditing(true); caret.current = o.caret; typed({ title: o.title, text: o.text, autoTitle: true }); // too long for a title: it goes into the description and typing goes on there
        }} />
      <div className={cn('grid gap-3', split && 'lg:grid-cols-2')}>
        {showEditor && <AutoText ref={descEl} className={cn('input note-text min-h-[5.5rem] w-full resize-none', font)} rows={3} aria-label="Description" placeholder="Description, notes, anything…" value={text} readOnly={ro} autoFocus={markdown && !split && editing && !!text.trim()}
          onChange={(e) => { setText(e.target.value); typed({ text: e.target.value }); }} onBlur={() => { if (markdown && !split && text.trim()) setEditing(false); }} />}
        {showPreview && <div className={cn('guide card min-h-[5.5rem] overflow-auto p-4', !split && 'cursor-text')} aria-label="Preview" title={split ? undefined : 'Click to edit'} dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted">Nothing to preview.</p>' }}
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest('a'); const m = a && /\/home\/([0-9a-f-]{36})/i.exec(a.getAttribute('href') ?? '');
            if (a && m && a.href.startsWith(location.origin)) { e.preventDefault(); onOpenNote(m[1]!.toLowerCase()); return; }
            if (!a && !split && !ro) { caret.current = text.length; setEditing(true); }
          }} />}
      </div>
      {links.length > 0 && <LinkedNotes ids={links} onOpen={onOpenNote} />}

      {!ro && (
        <div className="card space-y-3 p-3">
          <div className="space-y-1.5"><span className="text-xs font-medium text-muted">Tags</span><TagInput value={meta.tags} onChange={(tags) => set({ tags })} /></div>
          {meta.onList && <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 text-sm">Due
              <DatePicker aria-label="Due date" value={toLocalInput(meta.dueDate).slice(0, 10)} onChange={(v) => set({ dueDate: v ? new Date(`${v}T12:00`).toISOString() : null })} /></label>
          </div>}
          {meta.onList && <label className="flex items-center gap-3 text-sm">Progress
            <input type="range" className="bt-range bt-hit min-w-0 flex-1" min={0} max={100} step={5} value={pct} style={{ '--p': `${pct}%` } as CSSProperties} aria-label={`Progress: ${pct}%`} onChange={(e) => setMeta((m) => ({ ...m, percentDone: Number(e.target.value) / 100 }))}
              onPointerUp={() => set({ percentDone: meta.percentDone })} onKeyUp={() => set({ percentDone: meta.percentDone })} onBlur={() => set({ percentDone: meta.percentDone })} />
            <span className="w-10 text-right tabular-nums">{pct}%</span></label>}
          <div className="flex flex-wrap gap-2">
            {meta.onList
              ? <button type="button" className="btn !min-h-11" onClick={() => (meta.tags.length ? set({ onList: false }) : setPicking(true))}><Tags size={16} />Send to tags</button>
              : <button type="button" className="btn !min-h-11" onClick={() => set({ onList: true })}><ListChecks size={16} />Send to tasks</button>}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={markdown} onChange={(e) => { const t = e.target.checked ? 'markdown' : 'plain-text'; setNoteType(t); setEditing(!e.target.checked || !text.trim()); typed({ noteType: t }, true); }} />Markdown</label>
          </div>
        </div>)}
      <p className="text-xs text-muted">Created {new Date(note.createdAt).toLocaleString()} · {text.length.toLocaleString()} characters</p>
      {picking && <TagPicker initial={meta.tags} title="Send to tags" onClose={() => setPicking(false)}
        onDone={(tags) => { setPicking(false); if (tags.length) set({ tags, onList: false }); }} />}
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
