import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, FilePlus2, Pencil, Plus } from 'lucide-react';
import { api, type Note, type Project, type TagInfo } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { dateTitle } from '../lib/dates.ts';
import { SORTS, VIEWS, filterFromSearch, homeLink, sortNotes, viewParams, type HomeFilter } from '../lib/views.ts';
import { takeNotes } from '../lib/prefetch.ts';
import type { SortId } from '../lib/settings.ts';
import { Select } from '../components/Select.tsx';
import { TagChip } from '../components/TagChip.tsx';
import { TagDialog } from '../components/TagDialog.tsx';
import { NoteEditor } from '../components/NoteEditor.tsx';
import { KeepCard, NoteRow, titleOf } from '../components/NoteRow.tsx';
import { TagRail } from '../components/TagRail.tsx';
import { ProjectDialog } from '../components/ProjectDialog.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { useWide } from '../lib/useWide.ts';

/**
 * Home: tags on the left, the list of notes (tasks are notes with a checkbox) in the middle, the open note on the right. The view (Home, Today…)
 * is chosen with the buttons of the navigation. Everything lives in the address, so the open note and the filter survive a reload and a visit to
 * Settings. With the Google Keep view on, the list becomes a wall of cards and the note opens in a window.
 */
export function HomePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { settings, updateSettings, projects, tags, refreshMeta, notes, setNotes, openNote, setOpenNote } = useStore();
  const wide = useWide();
  const filter: HomeFilter = filterFromSearch(sp);
  const { view, showDone } = filter;
  const tag = filter.tag ?? '', project = filter.project ?? '', urlQ = filter.q ?? '';
  const [error, setError] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [editingTag, setEditingTag] = useState<TagInfo | null>(null);
  const loaded = useRef(false);

  const go = useCallback((noteId: string | null | undefined, f: Partial<HomeFilter>, replace = false) => nav(homeLink(noteId, { ...filter, ...f }), { replace }), [nav, view, tag, project, urlQ, showDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const params = viewParams({ view, tag: tag || undefined, project: project || undefined, q: urlQ || undefined, showDone });
    try { setNotes(await (takeNotes(params) ?? api.notes(params)).catch(() => api.notes(params))); setError(''); loaded.current = true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the notes'); }
  }, [view, tag, project, urlQ, showDone, setNotes]);
  useEffect(() => { void load(); }, [load]);

  // the open note is kept in the store: coming back from Settings (or a reload) shows it again on a wide screen
  useEffect(() => { if (id) setOpenNote(id); }, [id, setOpenNote]);
  useEffect(() => { if (!id && openNote && wide && sp.get('new') !== '1' && sp.get('newtask') !== '1') nav(homeLink(openNote, filter), { replace: true }); }, [id, openNote, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  // "New note" in the Add menu comes here with ?new=1
  const creating = useRef(false);
  useEffect(() => {
    if ((sp.get('new') !== '1' && sp.get('newtask') !== '1') || creating.current) return;
    creating.current = true;
    void newNote(sp.get('newtask') === '1').finally(() => { creating.current = false; });
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  async function newNote(asTask = false, title = dateTitle()) {
    const n = await api.createNote({ title, text: '', tags: tag ? [tag] : [] });
    if (asTask) await api.makeTask(n.id, project ? { projectId: Number(project) } : {});
    void refreshMeta(); await load();
    nav(homeLink(n.id, { ...filter, q: undefined }), { replace: sp.get('new') === '1' || sp.get('newtask') === '1' });
  }
  async function addQuick() {
    const t = quick.trim();
    if (!t) return;
    setQuick('');
    try { await newNote(true, t); } catch (e) { setError(e instanceof Error ? e.message : 'Could not add the task'); }
  }
  async function toggle(n: Note) {
    if (!n.task) return;
    try { await api.patchTask(n.id, { done: !n.task.done }); void refreshMeta(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the task'); }
  }
  const close = () => { setOpenNote(null); go(null, {}, false); };
  const meta = VIEWS.find((v) => v.id === view)!;
  const keep = settings.keepView;
  const sorted = useMemo(() => sortNotes(notes, settings.sort, keep), [notes, settings.sort, keep]);
  // the Tasks view lists the tasks under their tags (a task with two tags shows under both; one with none under "Tasks")
  const groups = useMemo(() => {
    if (view !== 'tasks') return null;
    const m = new Map<string, Note[]>();
    for (const n of sorted) for (const t of (n.tags.length ? n.tags : [''])) (m.get(t) ?? m.set(t, []).get(t)!).push(n);
    return [...m.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  }, [sorted, view]);
  const openTitle = openNote ? (notes.find((n) => n.id === openNote) ? titleOf(notes.find((n) => n.id === openNote)!) : 'your note') : '';

  // the wall fills the width: as many columns of at least 16 rem as fit, so a wide screen is used to its right edge
  const wall = { columnWidth: '16rem', columnGap: '0.75rem' } as const;
  const list = (
    <section aria-label="Notes" className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{meta.label}{tag && <span className="text-muted"> · {tag}</span>}</h1>
        <button className="btn" onClick={() => void newNote().catch((e) => setError(String(e)))}><FilePlus2 size={16} />New note</button>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addQuick(); }}>
        <input className="input" aria-label="Add a task" placeholder="Add a task, press Enter" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <button className="btn btn-accent" type="submit" aria-label="Add task" disabled={!quick.trim()}><Plus size={16} /></button>
      </form>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showDone} onChange={(e) => go(id, { showDone: e.target.checked })} />Show finished tasks</label>
        <Select className="!w-44 shrink-0 ml-auto text-sm" aria-label="Sort notes" value={settings.sort} onChange={(v) => updateSettings({ sort: v as SortId })} options={SORTS.map((x) => ({ value: x.id, label: x.label, icon: x.id === settings.sort ? <ArrowDownUp size={14} className="shrink-0 text-accent" /> : undefined }))} />
      </div>
      {urlQ && <p className="text-sm text-muted">Results for “{urlQ}” <button className="underline" onClick={() => go(id, { q: undefined })}>clear</button></p>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {!wide && !id && openNote && <button className="chip inline-flex items-center gap-1.5" onClick={() => nav(homeLink(openNote, filter))}><Pencil size={12} />Continue editing: {openTitle}</button>}
      {groups ? (
        <div className="space-y-4">{groups.map(([t, items]) => (
          <section key={t || '_'} aria-label={t || 'Tasks'} className="space-y-1.5">
            <h2 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold uppercase tracking-wider text-muted">{t ? <TagChip title={t} /> : 'Tasks'}<span className="font-normal">{items.length}</span></h2>
            {keep ? <ul style={wall}>{items.map((n) => <KeepCard key={n.id} n={n} onOpen={() => go(n.id, {})} onToggle={() => void toggle(n)} onChanged={() => void load()} />)}</ul>
              : <ul className="space-y-1.5">{items.map((n) => <NoteRow key={n.id} n={n} active={n.id === id} onOpen={() => go(n.id, {})} onToggle={() => void toggle(n)} onChanged={() => void load()} />)}</ul>}
          </section>))}</div>
      ) : keep
        ? <ul style={wall}>{sorted.map((n) => <KeepCard key={n.id} n={n} onOpen={() => go(n.id, {})} onToggle={() => void toggle(n)} onChanged={() => void load()} />)}</ul>
        : <ul className="space-y-1.5">{sorted.map((n) => <NoteRow key={n.id} n={n} active={n.id === id} onOpen={() => go(n.id, {})} onToggle={() => void toggle(n)} onChanged={() => void load()} />)}</ul>}
      {loaded.current && !notes.length && !error && <p className="py-8 text-center text-sm text-muted">{urlQ ? 'Nothing matches.' : 'Nothing here yet.'}</p>}
    </section>
  );

  const editor = id && <NoteEditor key={id} id={id} onBack={close} onGone={() => { setOpenNote(null); void load(); void refreshMeta(); go(null, {}, true); }} onOpenNote={(other) => go(other, {})} />;
  const rail = (
    <TagRail tags={tags} tag={tag} onTag={(t) => go(id, { tag: t || undefined })} onEditTag={setEditingTag} projects={projects} project={project} onProject={(p) => go(id, { project: p || undefined })}
      onNewProject={() => setEditing('new')} onEditProject={(p) => setEditing(p)} />
  );

  return (
    <>
      {keep ? (
        <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">{rail}{list}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:grid-cols-[11rem_minmax(16rem,22rem)_minmax(0,1fr)]">
          {(wide || !id) && <div className="md:col-span-2 lg:col-span-1">{rail}</div>}
          {(wide || !id) && list}
          {id ? <div className="min-w-0 md:col-start-2 lg:col-start-3 md:row-start-2 lg:row-start-1 md:row-span-1">{editor}</div>
            : wide && <Overview notes={notes} onOpen={(nid) => go(nid, {})} onNew={() => void newNote().catch((e) => setError(String(e)))} />}
        </div>)}
      {keep && id && <Dialog title="Note" wide onClose={close}>{editor}</Dialog>}
      {editingTag && <TagDialog tag={editingTag} onClose={() => setEditingTag(null)} onDone={() => { const gone = editingTag.title === tag; setEditingTag(null); void refreshMeta(); if (gone) go(id, { tag: undefined }); void load(); }} />}
      {editing && <ProjectDialog project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(to) => { setEditing(null); void refreshMeta(); if (to?.startsWith('project:')) go(id, { project: to.slice(8) }); else if (to === 'all') go(id, { project: undefined }); }} />}
    </>
  );
}

/** The right-hand side while no note is open: what is due, what is pinned, and how to start. */
function Overview({ notes, onOpen, onNew }: { notes: Note[]; onOpen: (id: string) => void; onNew: () => void }) {
  const open = notes.filter((n) => n.task && !n.task.done);
  const due = open.filter((n) => n.task!.dueDate).sort((a, b) => a.task!.dueDate!.localeCompare(b.task!.dueDate!)).slice(0, 6);
  const pinned = notes.filter((n) => n.pinned).slice(0, 6);
  const Item = ({ n }: { n: Note }) => <li><button className="w-full truncate rounded-theme px-2 py-1.5 text-left text-sm hover:bg-raised" onClick={() => onOpen(n.id)}>{titleOf(n)}</button></li>;
  return (
    <aside className="hidden min-w-0 space-y-5 md:col-start-2 md:block lg:col-start-3" aria-label="Overview">
      <div className="card space-y-1 p-4"><h2 className="font-semibold">Pick a note, or start one</h2><p className="text-sm text-muted">{notes.length} here · {open.length} open task{open.length === 1 ? '' : 's'}</p><button className="btn btn-accent mt-2" onClick={onNew}><FilePlus2 size={16} />New note</button></div>
      {due.length > 0 && <div className="card p-3"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Coming up</h3><ul>{due.map((n) => <Item key={n.id} n={n} />)}</ul></div>}
      {pinned.length > 0 && <div className="card p-3"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Pinned</h3><ul>{pinned.map((n) => <Item key={n.id} n={n} />)}</ul></div>}
    </aside>
  );
}
