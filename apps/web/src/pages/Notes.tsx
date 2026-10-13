import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, Download, Eye, FileText, Pin, PinOff, Plus, Trash2, Undo2, X } from 'lucide-react';
import { api, ApiError, saveBlob, type Note } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { ago } from '../lib/dates.ts';
import { renderMarkdown } from '../lib/markdown.ts';

const VIEWS = [{ id: 'notes', label: 'Notes' }, { id: 'archived', label: 'Archived' }, { id: 'trashed', label: 'Trash' }] as const;
const titleOf = (n: Note) => n.title.trim() || n.text.trim().split('\n')[0]?.slice(0, 80) || 'Untitled';

export function NotesPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as (typeof VIEWS)[number]['id']) || 'notes';
  const tag = params.get('tag') ?? '';
  const q = params.get('q') ?? '';
  const { notes, setNotes, tags, refreshMeta } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<number>();

  const load = useCallback(async () => {
    try { setNotes(await api.notes({ view, tag, q })); setError(null); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [view, tag, q, setNotes]);
  useEffect(() => { setLoading(true); window.clearTimeout(reloadTimer.current); reloadTimer.current = window.setTimeout(load, q ? 250 : 0); return () => window.clearTimeout(reloadTimer.current); }, [load, q]);

  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  async function create() {
    const n = await api.createNote({ title: '', text: '', tags: tag ? [tag] : [] });
    useStore.getState().upsertNote(n); void refreshMeta();
    nav(`/notes/${n.id}${params.toString() ? `?${params}` : ''}`);
  }
  useEffect(() => { if (params.get('new')) { const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); void create(); } /* eslint-disable-next-line */ }, [params.get('new')]);

  const current = notes.find((n) => n.id === id);
  const [fetched, setFetched] = useState<Note | null | 'loading'>('loading');
  useEffect(() => { setFetched('loading'); if (id && !notes.some((n) => n.id === id)) void api.getNoteSafe(id).then(setFetched); /* eslint-disable-next-line */ }, [id]);
  const open = current ?? (fetched === 'loading' ? null : fetched);
  const keep = params.toString() ? `?${params}` : '';

  return (
    <div className="grid gap-4 md:grid-cols-[19rem_minmax(0,1fr)]">
      <section className={cn('min-w-0 space-y-3', id && 'max-md:hidden')} aria-label="Notes list">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Which notes" className="flex gap-1 text-sm">
            {VIEWS.map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setParam('view', v.id === 'notes' ? '' : v.id)} className={cn('rounded-full border px-3 py-1', view === v.id ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg')}>{v.label}</button>)}
          </div>
          <button className="btn btn-accent ml-auto !px-2.5" onClick={() => void create()} aria-label="New note" title="New note"><Plus size={16} /></button>
        </div>
        <div className="flex gap-2">
          <input className="input" type="search" aria-label="Filter notes" placeholder="Filter" value={q} onChange={(e) => setParam('q', e.target.value)} />
          {tags.length > 0 && <select className="input !w-auto max-w-[45%]" aria-label="Tag" value={tag} onChange={(e) => setParam('tag', e.target.value)}><option value="">All tags</option>{tags.map((t) => <option key={t.title} value={t.title}>{t.title} ({t.count})</option>)}</select>}
        </div>
        {view === 'trashed' && notes.length > 0 && <button className="btn text-sm text-bad" onClick={async () => { if (confirm(`Delete ${notes.length} note${notes.length === 1 ? '' : 's'} in the trash for good?`)) { await api.emptyTrash(); void load(); void refreshMeta(); nav('/notes?view=trashed'); } }}><Trash2 size={15} />Empty trash</button>}
        {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
        {!loading && !notes.length && !error && <p className="py-8 text-center text-sm text-muted">{q || tag ? 'Nothing matches.' : view === 'notes' ? 'No notes yet. Press + to write one, or import from Settings.' : view === 'archived' ? 'Nothing archived.' : 'The trash is empty.'}</p>}
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}${keep}`} aria-current={n.id === id ? 'true' : undefined} className={cn('card bt-row block px-3 py-2 hover:border-accent', n.id === id && 'border-accent ring-1 ring-accent')}>
                <div className="flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{titleOf(n)}</span>{n.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}</div>
                <div className="line-clamp-2 whitespace-pre-line break-words text-xs text-muted">{(n.title.trim() ? n.text : n.text.split('\n').slice(1).join('\n')).slice(0, 200)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">{n.tags.slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}<span className="ml-auto">{ago(n.updatedAt)}</span></div>
              </Link>
            </li>))}
        </ul>
      </section>

      <section className={cn('min-w-0', !id && 'max-md:hidden')} aria-label="Note">
        {id && open ? <NoteEditor key={open.id} note={open} onBack={() => nav(`/notes${keep}`)} onGone={() => { void load(); nav(`/notes${keep}`); }} />
          : id && !current && fetched === 'loading' ? <p className="p-6 text-sm text-muted">Loading…</p>
          : id && !current && fetched === null ? <p className="p-6 text-sm text-muted">That note no longer exists. <Link className="underline" to={`/notes${keep}`}>Back to the list</Link></p>
          : <div className="hidden place-items-center rounded-theme border border-dashed border-line p-12 text-center text-sm text-muted md:grid"><div><FileText className="mx-auto mb-2" />Pick a note, or press + to write a new one.</div></div>}
      </section>
    </div>
  );
}

type Save = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict';

function NoteEditor({ note, onBack, onGone }: { note: Note; onBack: () => void; onGone: () => void }) {
  const { settings, upsertNote, refreshMeta, tags: allTags } = useStore();
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [noteType, setNoteType] = useState(note.noteType);
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [flags, setFlags] = useState({ pinned: note.pinned, archived: note.archived, trashed: note.trashed });
  const [status, setStatus] = useState<Save>('saved');
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [preview, setPreview] = useState(false);
  const base = useRef(note.updatedAt);
  const pending = useRef<Partial<Note> | null>(null);
  const timer = useRef<number>();
  const inflight = useRef(false);
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
      const typed = pending.current as Partial<Note> | null; // what the user typed while this was in flight wins
      pending.current = { ...patch, ...(typed ?? {}) };
      if (e instanceof ApiError && e.status === 409) { setTheirs(e.body.note as Note); setStatus('conflict'); }
      else if (e instanceof ApiError && e.status === 404) onGone();
      else { setStatus('offline'); timer.current = window.setTimeout(() => void flush(), 5000); }
    } finally { inflight.current = false; }
    if (pending.current && !inflight.current && !theirsRef.current) timer.current = window.setTimeout(() => void flush(), 300);
  }, [note.id, upsertNote, refreshMeta, onGone]);
  const theirsRef = useRef<Note | null>(null);
  theirsRef.current = theirs;

  const change = (patch: Partial<Note>, now = false) => {
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

  const setFlag = (k: keyof typeof flags, v: boolean) => { setFlags((f) => ({ ...f, [k]: v })); change({ [k]: v } as Partial<Note>, true); };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (t && !tags.includes(t)) { const next = [...tags, t]; setTags(next); change({ tags: next }, true); }
    setTagDraft('');
  };
  const dropTag = (t: string) => { const next = tags.filter((x) => x !== t); setTags(next); change({ tags: next }, true); };
  const download = () => saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${(title || 'note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.${markdown ? 'md' : 'txt'}`);
  const html = useMemo(() => (markdown && (preview || settings.notePreview) ? renderMarkdown(text) : ''), [markdown, preview, settings.notePreview, text]);
  const showPreview = markdown && (preview || settings.notePreview);
  const font = settings.noteFont === 'mono' ? 'mono' : '';

  const label: Record<Save, string> = { saved: 'Saved', saving: 'Saving…', dirty: 'Unsaved', offline: 'Offline: will retry', conflict: 'Changed elsewhere' };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="btn btn-ghost !px-2 md:hidden" onClick={onBack} aria-label="Back to the list"><ArrowLeft size={17} /></button>
        <span className={cn('text-xs', status === 'saved' ? 'text-muted' : status === 'saving' || status === 'dirty' ? 'text-warn' : 'text-bad')} aria-live="polite">{label[status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!flags.trashed && <button className="btn btn-ghost !px-2" onClick={() => setFlag('pinned', !flags.pinned)} aria-pressed={flags.pinned} title={flags.pinned ? 'Unpin' : 'Pin'}>{flags.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
          {!flags.trashed && <button className="btn btn-ghost !px-2" onClick={() => { setFlag('archived', !flags.archived); }} title={flags.archived ? 'Unarchive' : 'Archive'}>{flags.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>}
          <button className="btn btn-ghost !px-2" onClick={download} title={`Download as .${markdown ? 'md' : 'txt'}`}><Download size={16} /></button>
          {flags.trashed
            ? <><button className="btn !px-2.5 text-sm" onClick={() => setFlag('trashed', false)}><Undo2 size={15} />Restore</button>
              <button className="btn !px-2.5 text-sm text-bad" onClick={async () => { if (confirm('Delete this note for good?')) { pending.current = null; await api.deleteNote(note.id); void refreshMeta(); onGone(); } }}><Trash2 size={15} />Delete forever</button></>
            : <button className="btn btn-ghost !px-2" onClick={() => { setFlag('trashed', true); }} title="Move to trash"><Trash2 size={16} /></button>}
        </div>
      </div>

      {status === 'conflict' && theirs && (
        <div role="alert" className="space-y-2 rounded-theme border border-warn p-3 text-sm">
          <p>This note was changed on another device ({new Date(theirs.updatedAt).toLocaleString()}) after you opened it. Your edits are not saved yet.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => { base.current = theirs.updatedAt; setTheirs(null); void flush(); }}>Keep mine</button>
            <button className="btn" onClick={() => { pending.current = null; base.current = theirs.updatedAt; setTitle(theirs.title); setText(theirs.text); setTags(theirs.tags); setNoteType(theirs.noteType); upsertNote(theirs); setTheirs(null); setStatus('saved'); }}>Use theirs</button>
            <button className="btn btn-ghost" onClick={() => saveBlob(new Blob([text], { type: 'text/plain' }), 'my-version.txt')}>Save mine as a file</button>
          </div>
        </div>)}

      <input className="input !text-lg font-semibold" aria-label="Title" placeholder="Title" value={title} readOnly={flags.trashed} onChange={(e) => { setTitle(e.target.value); change({ title: e.target.value }); }} />
      <div className={cn('grid gap-3', showPreview && 'lg:grid-cols-2')}>
        <textarea className={cn('input note-text min-h-[50vh] w-full resize-y', font)} aria-label="Note text" placeholder="Write something…" value={text} readOnly={flags.trashed} onChange={(e) => { setText(e.target.value); change({ text: e.target.value }); }} />
        {showPreview && <div className="guide card min-h-[12rem] overflow-auto p-4" aria-label="Preview" dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted">Nothing to preview.</p>' }} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => <span key={t} className="chip inline-flex items-center gap-1">{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => dropTag(t)}><X size={11} /></button></span>)}
        <input className="input !w-40" list="all-tags" aria-label="Add a tag" placeholder="Add tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); } }} onBlur={() => tagDraft && addTag(tagDraft)} />
        <datalist id="all-tags">{allTags.map((t) => <option key={t.title} value={t.title} />)}</datalist>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={markdown} onChange={(e) => { const t = e.target.checked ? 'markdown' : 'plain-text'; setNoteType(t); change({ noteType: t }, true); }} />Markdown</label>
        {markdown && !settings.notePreview && <button className="btn btn-ghost !px-2 text-xs" aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={14} />Preview</button>}
      </div>
      <p className="text-xs text-muted">Created {new Date(note.createdAt).toLocaleString()} · {text.length.toLocaleString()} characters</p>
    </div>
  );
}
