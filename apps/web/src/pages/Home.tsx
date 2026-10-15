import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, Pencil, Plus } from 'lucide-react';
import { api, type Note, type TagInfo } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { SORTS, canReorder, filterFromSearch, homeLink, matchesFilter, positionBetween, sortNotes, viewParams, type HomeFilter } from '../lib/views.ts';
import { excerpt, pokeWidgets } from '../lib/actions.ts';
import { notesKey, takeNotes } from '../lib/prefetch.ts';
import type { SortId } from '../lib/settings.ts';
import { useItemUi } from '../lib/useItemUi.tsx';
import { Select } from '../components/Select.tsx';
import { TagDialog } from '../components/TagDialog.tsx';
import { NoteEditor } from '../components/NoteEditor.tsx';
import { Composer } from '../components/Composer.tsx';
import { ItemRow, titleOf } from '../components/ItemRow.tsx';
import { Sortable, SortableList } from '../components/SortableList.tsx';
import { TagRail } from '../components/TagRail.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { useWide } from '../lib/useWide.ts';

/** What each filter last showed: coming back to Home (from Settings, say) draws the list at once and updates it behind the scenes. */
const cache = new Map<string, Note[]>();

/**
 * Home: the tasks and tags column on the left, the list in the middle (the composer on top), the open item on the right. The filter and the open item
 * live in the address, so a reload or a visit to Settings shows the same thing. With the Google Keep view on, the list becomes a wall of cards and the
 * item opens in a window. Dragging an item to a new place changes your own order (touch: use the grip).
 */
export function HomePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { settings, updateSettings, tags, refreshMeta, notes, setNotes, upsertNote, replaceNote, openNote, setOpenNote } = useStore();
  const wide = useWide();
  const filter: HomeFilter = filterFromSearch(sp);
  const params = viewParams(filter), key = notesKey(params);
  const [error, setError] = useState('');
  const [editingTag, setEditingTag] = useState<TagInfo | null>(null);
  const [loaded, setLoaded] = useState(cache.has(key));
  const shown = useRef('');

  const go = useCallback((noteId: string | null | undefined, f: Partial<HomeFilter> = {}, replace = false) => nav(homeLink(noteId, { ...filter, ...f }), { replace }), [nav, filter.scope, filter.tag, filter.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const list = await (takeNotes(params) ?? api.notes(params)).catch(() => api.notes(params));
      cache.set(key, list);
      if (shown.current === key) { setNotes(list); setLoaded(true); setError(''); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { shown.current = key; setNotes(cache.get(key) ?? []); setLoaded(cache.has(key)); void load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded && shown.current === key) cache.set(key, notes); }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // the open note is kept in the store: coming back from Settings (or a reload) shows it again on a wide screen
  useEffect(() => { if (id) setOpenNote(id); }, [id, setOpenNote]);
  useEffect(() => { if (!id && openNote && wide) nav(homeLink(openNote, filter), { replace: true }); }, [id, openNote, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => { setOpenNote(null); go(null, {}, false); }, [go, setOpenNote]);
  const closeIfOpen = useCallback((nid: string) => { if (useStore.getState().openNote === nid) { setOpenNote(null); nav(homeLink(null, filter), { replace: true }); } }, [setOpenNote, nav, filter.scope, filter.tag, filter.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = useItemUi({ pile: 'live', open: (nid) => go(nid), closeIfOpen });

  const keep = settings.keepView;
  const visible = useMemo(() => sortNotes(notes.filter((n) => matchesFilter(n, filter)), settings.sort), [notes, settings.sort, filter.scope, filter.tag, filter.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const draggable = canReorder(settings.sort, filter) && visible.length > 1;
  const openTitle = openNote ? (notes.find((n) => n.id === openNote) ? titleOf(notes.find((n) => n.id === openNote)!) : 'your note') : '';
  const heading = filter.q ? `Search` : filter.tag ? filter.tag.split('.').pop()! : filter.scope === 'list' ? 'Tasks' : filter.scope === 'all' ? 'All notes' : 'No tag';

  const added = useCallback((n: Note) => { upsertNote(excerpt(n)); }, [upsertNote]);

  async function move(moved: string, above: string | null, below: string | null) {
    const pos = (nid: string | null) => (nid ? notes.find((n) => n.id === nid)?.position : undefined);
    const mine = notes.find((n) => n.id === moved);
    const p = positionBetween(pos(above), pos(below));
    if (mine && p !== null) replaceNote({ ...mine, position: p }); // lands at once; the server confirms
    try {
      const saved = await api.moveNote(moved, above, below);
      replaceNote(excerpt(saved));
      if (p === null) await load(); // the neighbours were renumbered
      pokeWidgets();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not move that'); void load(); }
  }

  const row = (n: Note) => {
    const props = { n, variant: keep ? 'card' as const : 'row' as const, active: n.id === id, onOpen: () => go(n.id), ...item.rowProps(n) };
    return draggable ? <Sortable key={n.id} id={n.id}>{(drag) => <ItemRow {...props} drag={drag} />}</Sortable> : <ItemRow key={n.id} {...props} />;
  };
  const listEl = (
    <ul className={keep ? 'grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]' : 'space-y-1.5'}>{visible.map(row)}</ul>
  );

  const list = (
    <section aria-label="Items" className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{filter.tag && tags.find((t) => t.title === filter.tag)?.emoji} {heading}{filter.tag && filter.tag.includes('.') && <span className="text-sm font-normal text-muted"> · {filter.tag}</span>}</h1>
        <Select className="!w-44 shrink-0 text-sm" aria-label="Sort" value={settings.sort} onChange={(v) => updateSettings({ sort: v as SortId })} options={SORTS.map((x) => ({ value: x.id, label: x.label, icon: x.id === settings.sort ? <ArrowDownUp size={14} className="shrink-0 text-accent" /> : undefined }))} />
      </div>
      {!filter.q && <Composer key={filter.tag ?? ''} tag={filter.tag} autoFocus={wide && !id} onAdded={added} />}
      {filter.q && <p className="text-sm text-muted">Results for “{filter.q}” <button className="underline" onClick={() => go(id, { q: undefined })}>clear</button></p>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {!wide && !id && openNote && <button className="chip inline-flex items-center gap-1.5" onClick={() => nav(homeLink(openNote, filter))}><Pencil size={12} />Continue editing: {openTitle}</button>}
      {draggable ? <SortableList ids={visible.map((n) => n.id)} grid={keep} onMove={(a, b, c) => void move(a, b, c)}>{listEl}</SortableList> : listEl}
      {loaded && !visible.length && !error && (
        <p className="py-8 text-center text-sm text-muted">{filter.q ? 'Nothing matches.' : filter.tag ? 'Nothing under this tag yet.' : filter.scope === 'list' ? 'Your list is empty. Type something above.' : 'Nothing here.'}</p>)}
      {draggable && <p className="text-center text-xs text-muted">Drag to reorder. On a touch screen, drag the grip. Tap the arrow to read the description. Right-click or hold for more.</p>}
    </section>
  );

  const send = sp.get('send') === '1'; // the widget's "Save to memory": the item opens with the tag picker ready
  const editor = id && <NoteEditor key={id} id={id} startPicking={send} onPicked={() => nav(homeLink(id, filter), { replace: true })} onBack={close} onGone={() => { setOpenNote(null); go(null, {}, true); }} onOpenNote={(other) => go(other)} />;
  const rail = (
    <TagRail tags={tags} filter={filter} counts={{ list: filter.scope === 'list' && !filter.tag && !filter.q && loaded ? visible.length : null }}
      onScope={(s) => go(id, { scope: s, tag: undefined, q: undefined })} onTag={(t) => go(id, { tag: t || undefined, scope: 'list', q: undefined })} onEditTag={setEditingTag} />
  );

  return (
    <>
      {keep ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">{rail}{list}</div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(17rem,26rem)_minmax(0,1fr)] lg:grid-cols-[11rem_minmax(17rem,28rem)_minmax(0,1fr)]">
          {(wide || !id) && <div className="min-w-0 md:col-span-2 lg:col-span-1">{rail}</div>}
          {(wide || !id) && list}
          {id ? <div className="min-w-0 md:col-start-2 md:row-start-2 lg:col-start-3 lg:row-start-1">{editor}</div>
            : wide && <Overview notes={visible} filter={filter} onOpen={(nid) => go(nid)} />}
        </div>)}
      {keep && id && <Dialog title="Note" wide onClose={close}>{editor}</Dialog>}
      {editingTag && <TagDialog tag={editingTag} onClose={() => setEditingTag(null)} onDone={() => { const gone = editingTag.title === filter.tag; setEditingTag(null); void refreshMeta(); if (gone) go(id, { tag: undefined }); void load(); }} />}
      {item.ui}
    </>
  );
}

/** The right-hand side while nothing is open: what is due and what is pinned. */
function Overview({ notes, filter, onOpen }: { notes: Note[]; filter: HomeFilter; onOpen: (id: string) => void }) {
  const due = notes.filter((n) => n.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 6);
  const pinned = notes.filter((n) => n.pinned).slice(0, 6);
  const Item = ({ n }: { n: Note }) => <li><button className="w-full truncate rounded-theme px-2 py-2 text-left text-sm hover:bg-raised" onClick={() => onOpen(n.id)}>{titleOf(n)}</button></li>;
  return (
    <aside className="hidden min-w-0 space-y-4 md:col-start-2 md:block lg:col-start-3" aria-label="Overview">
      <div className="card space-y-1 p-4"><h2 className="font-semibold">Type to add, tap to read</h2>
        <p className="text-sm text-muted">{notes.length} here{filter.scope === 'list' && !filter.tag ? ` on your list` : ''}. Add something in the box above; press Tab for a description. Open an item to edit it, or use the arrow on its row to read it in place.</p>
        <p className="flex items-center gap-1 pt-1 text-xs text-muted"><Plus size={12} />Right-click (or hold) an item to pin, file, link, download or bin it.</p></div>
      {due.length > 0 && <div className="card p-3"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Coming up</h3><ul>{due.map((n) => <Item key={n.id} n={n} />)}</ul></div>}
      {pinned.length > 0 && <div className="card p-3"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Pinned</h3><ul>{pinned.map((n) => <Item key={n.id} n={n} />)}</ul></div>}
    </aside>
  );
}
