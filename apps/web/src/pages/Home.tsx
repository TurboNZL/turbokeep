import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FilePlus2, Pencil, Plus } from 'lucide-react';
import { api, type Note, type Project } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { dateTitle } from '../lib/dates.ts';
import { VIEWS, homeLink, isView, viewParams, type HomeFilter } from '../lib/views.ts';
import { NoteEditor } from '../components/NoteEditor.tsx';
import { KeepCard, NoteRow, titleOf } from '../components/NoteRow.tsx';
import { TagRail } from '../components/TagRail.tsx';
import { ProjectDialog } from '../components/ProjectDialog.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { useWide } from '../lib/useWide.ts';

/**
 * Home: tags on the left, the list of notes (tasks are notes with a checkbox) in the middle, the open note on the right. The view (Inbox, Today…)
 * is chosen with the buttons of the navigation. Everything lives in the address, so the open note and the filter survive a reload and a visit to
 * Settings. With the Google Keep view on, the list becomes a wall of cards and the note opens in a window.
 */
export function HomePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { settings, projects, tags, refreshMeta, notes, setNotes, openNote, setOpenNote } = useStore();
  const wide = useWide();
  const view = isView(sp.get('view')) ? (sp.get('view') as HomeFilter['view']) : 'inbox';
  const tag = sp.get('tag') ?? '', project = sp.get('project') ?? '', showDone = sp.get('done') === '1';
  const urlQ = sp.get('q') ?? '';
  const filter: HomeFilter = { view, tag: tag || undefined, project: project || undefined, q: urlQ || undefined, showDone };
  const [error, setError] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const loaded = useRef(false);

  const go = useCallback((noteId: string | null | undefined, f: Partial<HomeFilter>, replace = false) => nav(homeLink(noteId, { ...filter, ...f }), { replace }), [nav, view, tag, project, urlQ, showDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try { setNotes(await api.notes(viewParams({ view, tag: tag || undefined, project: project || undefined, q: urlQ || undefined, showDone }))); setError(''); loaded.current = true; }
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
  const openTitle = openNote ? (notes.find((n) => n.id === openNote) ? titleOf(notes.find((n) => n.id === openNote)!) : 'your note') : '';

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
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showDone} onChange={(e) => go(id, { showDone: e.target.checked })} />Show finished tasks</label>
      {urlQ && <p className="text-sm text-muted">Results for “{urlQ}” <button className="underline" onClick={() => go(id, { q: undefined })}>clear</button></p>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {!wide && !id && openNote && <button className="chip inline-flex items-center gap-1.5" onClick={() => nav(homeLink(openNote, filter))}><Pencil size={12} />Continue editing: {openTitle}</button>}
      {keep
        ? <ul className="columns-1 gap-3 sm:columns-2 xl:columns-3 2xl:columns-4">{notes.map((n) => <KeepCard key={n.id} n={n} onOpen={() => go(n.id, {})} onToggle={() => void toggle(n)} />)}</ul>
        : <ul className="space-y-1.5">{notes.map((n) => <NoteRow key={n.id} n={n} active={n.id === id} onOpen={() => go(n.id, {})} onToggle={() => void toggle(n)} />)}</ul>}
      {loaded.current && !notes.length && !error && <p className="py-8 text-center text-sm text-muted">{urlQ ? 'Nothing matches.' : 'Nothing here yet.'}</p>}
    </section>
  );

  const editor = id && <NoteEditor key={id} id={id} onBack={close} onGone={() => { setOpenNote(null); void load(); void refreshMeta(); go(null, {}, true); }} onOpenNote={(other) => go(other, {})} />;
  const rail = (
    <TagRail tags={tags} tag={tag} onTag={(t) => go(id, { tag: t || undefined })} projects={projects} project={project} onProject={(p) => go(id, { project: p || undefined })}
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
            : wide && <p className="hidden place-self-center text-sm text-muted md:block md:col-start-2 lg:col-start-3">Pick a note, or make a new one.</p>}
        </div>)}
      {keep && id && <Dialog title="Note" wide onClose={close}>{editor}</Dialog>}
      {editing && <ProjectDialog project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(to) => { setEditing(null); void refreshMeta(); if (to?.startsWith('project:')) go(id, { project: to.slice(8) }); else if (to === 'all') go(id, { project: undefined }); }} />}
    </>
  );
}
