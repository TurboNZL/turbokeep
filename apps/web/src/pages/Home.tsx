import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Emoji } from '../lib/emoji.tsx';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, Pencil, Plus, X } from 'lucide-react';
import { api, type Note, type TagInfo } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { SORTS, canReorder, dueSoon, filterFromSearch, homeLink, hasTag, matchesFilter, positionBetween, sortKey, sortNotes, tasksInTags, viewParams, type HomeFilter } from '../lib/views.ts';
import { excerpt, pokeWidgets } from '../lib/actions.ts';
import { notesKey, takeNotes } from '../lib/prefetch.ts';
import { cacheLevel, recall, remember, rememberNote } from '../lib/cache.ts';
import { markFresh } from '../lib/fresh.ts';
import { SIZE_LIMITS } from '../lib/settings.ts';
import { Divider } from '../components/Divider.tsx';
import type { SortId } from '../lib/settings.ts';
import { useItemUi } from '../lib/useItemUi.tsx';
import { Select } from '../components/Select.tsx';
import { TagDialog } from '../components/TagDialog.tsx';
import { NoteEditor } from '../components/NoteEditor.tsx';
import { editorFocusPending } from '../lib/focus.ts';
import { Composer } from '../components/Composer.tsx';
import { ItemRow, titleOf } from '../components/ItemRow.tsx';
import { Sortable, SortableList } from '../components/SortableList.tsx';
import { TagRail } from '../components/TagRail.tsx';
import { railTags } from '../lib/tagTree.ts';
import { Dialog } from '../components/Dialog.tsx';
import { OtherPiles } from '../components/OtherPiles.tsx';
import { useWide } from '../lib/useWide.ts';

/** how many items are drawn at first, and added each time the end of the list comes into view */
const PAGE = 40;
const SCOPE_NAMES = { list: 'Tasks', all: 'All notes', due: 'Due soon' } as const;
/** the editor panel stays on screen while the list scrolls */
/** the editor column: as tall as the window above the dock, the editor scrolling inside it and the close bar fixed to its bottom edge */
const STICKY = 'md:sticky md:top-20 md:self-start md:flex md:h-[calc(100dvh-6.5rem-var(--dock-h,0px))] md:flex-col';

/** What each filter last showed: coming back to Home (from Settings, say) draws the list at once and updates it behind the scenes. */
const memo = { has: (k: string) => recall<Note[]>(`notes:${k}`) !== undefined, get: (k: string) => recall<Note[]>(`notes:${k}`), set: (k: string, v: Note[]) => remember(`notes:${k}`, v) };

/**
 * Home: the tasks and tags column on the left, the list in the middle (the composer on top), the open item on the right. The Archive is the same page for
 * what you are not using any more (no composer; its tags and tasks are the archived ones). The filter and the open item
 * live in the address, so a reload or a visit to Settings shows the same thing. With the Google Keep view on, the list becomes a wall of cards and the
 * item opens in a window. Dragging an item to a new place changes your own order (touch: use the grip).
 */
export function HomePage({ archive = false }: { archive?: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { settings, updateSettings, tags, refreshMeta, notes, setNotes, upsertNote, replaceNote, openNote, setOpenNote } = useStore();
  const wide = useWide();
  const filter: HomeFilter = filterFromSearch(sp);
  const base = archive ? '/archive' : '/home';
  const withTasks = tasksInTags(settings.countTasks, archive);
  const params = viewParams(filter, archive, withTasks), key = notesKey(params);
  const [error, setError] = useState('');
  const [editingTag, setEditingTag] = useState<TagInfo | null>(null);
  const [showAllTags, setShowAllTags] = useState(false); // temporary on purpose: not kept in the settings
  const [loaded, setLoaded] = useState(memo.has(key));
  const shown = useRef('');

  const go = useCallback((noteId: string | null | undefined, f: Partial<HomeFilter> = {}, replace = false) => nav(homeLink(noteId, { ...filter, ...f }, base), { replace }), [nav, base, filter.scope, filter.tag, filter.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const list = await (takeNotes(params) ?? api.notes(params)).catch(() => api.notes(params));
      memo.set(key, list);
      if (shown.current === key) {
        // what the server added since the copy we drew slides in; the rest stays where it is
        const had = new Set(useStore.getState().notes.map((n) => n.id));
        if (had.size) for (const n of list) if (!had.has(n.id)) markFresh(n.id);
        setNotes(list); setLoaded(true); setError('');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { shown.current = key; setNotes(memo.get(key) ?? []); setLoaded(memo.has(key)); void load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded && shown.current === key) memo.set(key, notes); }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // High cache level: ask ahead in the background (the Archive's lists and the first items), so they open without a wait
  useEffect(() => {
    if (!loaded || cacheLevel() !== 'high') return;
    const t = window.setTimeout(() => {
      if (!archive) { const p = viewParams({ scope: 'list' }, true, tasksInTags(settings.countTasks, true)); void api.notes(p).then((l) => remember(`notes:${notesKey(p)}`, l), () => {}); }
      for (const n of useStore.getState().notes.slice(0, 20)) void api.noteOrNull(n.id).then((d) => d && rememberNote(d));
    }, 1200);
    return () => window.clearTimeout(t);
  }, [loaded, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // what each page showed last is kept (setPage below), so another page and back finds it as it was
  useEffect(() => { if (id) setOpenNote(id); }, [id, setOpenNote]);
  const setPage = useStore((s) => s.setPage);
  const search = typeof location !== 'undefined' ? location.search : '';
  useEffect(() => { setPage(archive ? 'archive' : 'home', id ?? null, search); }, [id, search, archive, setPage]);

  const close = useCallback(() => { setOpenNote(null); go(null, {}, false); }, [go, setOpenNote]);
  const closeIfOpen = useCallback((nid: string) => { if (useStore.getState().openNote === nid) { setOpenNote(null); nav(homeLink(null, filter, base), { replace: true }); } }, [setOpenNote, nav, base, filter.scope, filter.tag, filter.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = useItemUi({ pile: archive ? 'archive' : 'live', open: (nid) => go(nid), closeIfOpen });

  const keep = settings.viewStyle !== 'list';
  const pane = settings.viewStyle === 'pane' && useWide(1024); // cards with the editor in a panel on the right (not a window)
  // every page and tab keeps the order it was given; "Due soon" is always the closest first
  const skey = sortKey(filter, archive), sort = settings.sorts[skey] ?? settings.sort, soon = filter.scope === 'due' && !filter.tag && !filter.q;
  const visible = useMemo(() => {
    const here = notes.filter((n) => matchesFilter(n, filter, archive, withTasks));
    return soon ? dueSoon(here) : sortNotes(here, sort);
  }, [notes, sort, soon, archive, withTasks, filter.scope, filter.tag, filter.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const draggable = canReorder(sort, filter) && visible.length > 1;
  const openTitle = openNote ? (notes.find((n) => n.id === openNote) ? titleOf(notes.find((n) => n.id === openNote)!) : 'your note') : '';
  const name = filter.q ? 'Search' : filter.tag ? filter.tag.split('.').pop()! : SCOPE_NAMES[filter.scope];
  const heading = archive ? `Archive · ${filter.scope === 'list' && !filter.tag && !filter.q ? 'Old Tasks' : name}` : name;

  // the Archive's own tag column: only the tags something archived was sent to
  const [archiveTags, setArchiveTags] = useState<TagInfo[]>(() => recall<TagInfo[]>(`tags:archived:${withTasks}`) ?? []);
  const archivedCount = archive ? notes.length : 0;
  useEffect(() => { if (archive) api.tags('archived', withTasks).then((t) => { remember(`tags:archived:${withTasks}`, t); setArchiveTags(t); }, () => {}); }, [archive, archivedCount, withTasks]);

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
  const swapped = useRef(false); // the first list drawn comes in with the page; later ones (another tag, tab or page) swap in
  useEffect(() => { swapped.current = true; }, []);
  // A long list is drawn a page at a time (a big tag used to draw every item at once): the next page comes as the end scrolls into view
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [key]);
  const drawn = useMemo(() => visible.slice(0, limit), [visible, limit]);
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el || drawn.length >= visible.length) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE); }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [drawn.length, visible.length]);
  const listEl = keep ? <Wall items={drawn} render={row} minRem={settings.cardWidth} gapRem={settings.cardGap} /> : <ul className="space-y-1.5">{drawn.map(row)}</ul>;

  const listRef = useRef<HTMLElement>(null);
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const openObj = id ? notes.find((n) => n.id === id) : undefined;
  // the divider shows itself when the list is one tag's and the open note is not under it (Settings > Appearance)
  const foreign = settings.dividerWhenForeign && !!filter.tag && !!id && !(openObj && hasTag(openObj, filter.tag));
  const idleFull = settings.fullWhenIdle && !id && !keep;
  const list = (
    <section ref={listRef} aria-label="Items" className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate py-1 text-xl font-bold leading-normal">{filter.tag && tags.find((t) => t.title === filter.tag)?.emoji ? <Emoji value={tags.find((t) => t.title === filter.tag)!.emoji} /> : null} {heading}{filter.tag && filter.tag.includes('.') && <span className="text-sm font-normal text-muted"> · {filter.tag}</span>}</h1>
        {soon
          ? <span className="shrink-0 text-xs text-muted">Closest first</span>
          : <Select className="!w-44 shrink-0 text-sm" aria-label={`Sort ${name}`} value={sort} onChange={(v) => updateSettings({ sorts: { ...settings.sorts, [skey]: v as SortId } })} options={SORTS.map((x) => ({ value: x.id, label: x.label, icon: x.id === sort ? <ArrowDownUp size={14} className="shrink-0 text-accent" /> : undefined }))} />}
      </div>
      {soon && <p className="-mt-1 text-xs text-muted">The next five things with a date, and everything else due before the end of the day, week, month or 3 months they fall in. Overdue ones come first.</p>}
      {!filter.q && !archive && !soon && <Composer key={filter.tag ?? ''} tag={filter.tag} autoFocus={wide && !id} onAdded={added} onPopup={settings.popupOnType ? (n) => go(n.id) : undefined} />}
      {filter.q && <><p className="text-sm text-muted">Results for “{filter.q}” on {archive ? 'the Archive' : 'Home'} <button className="underline" onClick={() => go(id, { q: undefined })}>clear</button></p><OtherPiles q={filter.q} from={archive ? 'archive' : 'home'} seed={notes.length} /></>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {!wide && !id && openNote && <button className="chip inline-flex items-center gap-1.5" onClick={() => nav(homeLink(openNote, filter, base))}><Pencil size={12} />Continue editing: {openTitle}</button>}
      <div key={key} className={cn(swapped.current && 'tk-swap')}>{draggable ? <SortableList ids={drawn.map((n) => n.id)} grid={keep} onMove={(a, b, c) => void move(a, b, c)}>{listEl}</SortableList> : listEl}</div>
      {drawn.length < visible.length && <div ref={more} className="py-3 text-center text-xs text-muted">Showing {drawn.length} of {visible.length}. <button type="button" className="underline" onClick={() => setLimit((l) => l + PAGE)}>Show more</button></div>}
      {loaded && !visible.length && !error && (
        <p className="py-8 text-center text-sm text-muted">{filter.q ? 'Nothing matches.' : archive ? 'Nothing archived here.' : filter.tag ? 'Nothing under this tag yet. Send a note to it.' : filter.scope === 'list' ? 'Your list is empty. Type something above.' : filter.scope === 'due' ? 'Nothing has a date yet.' : 'Nothing here.'}</p>)}
      {draggable && <p className="text-center text-xs text-muted">Drag to reorder. On a touch screen, drag the grip. Tap an item to read it, the pencil to edit it. Right-click or hold for more.</p>}
      {!filter.q && !archive && !soon && <div className="h-28 md:hidden" aria-hidden />}
    </section>
  );

  const send = sp.get('send') === '1'; // the widget's "Save to memory": the item opens with the tag picker ready
  const editor = id && <NoteEditor key={id} id={id} startPicking={send} onPicked={() => nav(homeLink(id, filter, base), { replace: true })} onBack={close} onGone={() => { setOpenNote(null); go(null, {}, true); }} onOpenNote={(other) => go(other)} />;
  const rail = (
    <TagRail tags={railTags(archive ? archiveTags : tags, tags, showAllTags)} showAll={showAllTags} onShowAll={setShowAllTags} archive={archive} filter={filter} counts={{ list: !archive && filter.scope === 'list' && !filter.tag && !filter.q && loaded ? visible.length : null }}
      onScope={(s) => go(id, { scope: s, tag: undefined, q: undefined })} onTag={(t) => go(id, { tag: t || undefined, scope: 'list', q: undefined })} onEditTag={setEditingTag} />
  );

  const panel = (
    <div className="relative min-w-0">
      <Divider side="left" lit={foreign} label="Drag to change the width of the editor" onSize={(x, box) => updateSettings({ paneWidth: Math.round(Math.min(SIZE_LIMITS.paneWidth.max, Math.max(SIZE_LIMITS.paneWidth.min, (box.right - x) / rem()))) })} />
      <div key={id} className={cn(STICKY, !editorFocusPending(id!) && 'tk-slide-in')}><div className="md:min-h-0 md:flex-1 md:overflow-y-auto">{editor}</div><CloseBar onClose={close} /></div>
    </div>);
  return (
    <>
      {keep ? (
        <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-4', pane && id ? 'lg:grid-cols-[var(--rail-w,11rem)_minmax(0,1fr)_minmax(16rem,min(var(--pane-w,28rem),85%))]' : 'lg:grid-cols-[var(--rail-w,11rem)_minmax(0,1fr)]')}>{rail}{list}{pane && id && panel}</div>
      ) : (
        <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-4', idleFull ? 'lg:grid-cols-[var(--rail-w,11rem)_minmax(0,1fr)]' : 'md:grid-cols-[minmax(12rem,min(var(--list-w,26rem),85%))_minmax(0,1fr)] lg:grid-cols-[var(--rail-w,11rem)_minmax(12rem,min(var(--list-w,28rem),85%))_minmax(0,1fr)]')}>
          {(wide || !id) && <div className="min-w-0 md:col-span-2 lg:col-span-1">{rail}</div>}
          {(wide || !id) && list}
          {id ? <div className="relative min-w-0 md:col-start-2 md:row-start-2 lg:col-start-3 lg:row-start-1">
            {wide && <Divider side="left" lit={foreign} label="Drag to change the width of the list" onSize={(x) => { const l = listRef.current?.getBoundingClientRect(); if (l) updateSettings({ listWidth: Math.round(Math.min(SIZE_LIMITS.listWidth.max, Math.max(SIZE_LIMITS.listWidth.min, (x - l.left) / rem()))) }); }} />}
            <div key={id} className={cn(STICKY, !editorFocusPending(id!) && 'tk-slide-in')}><div className="md:min-h-0 md:flex-1 md:overflow-y-auto">{editor}</div><CloseBar onClose={close} /></div></div>
            : wide && !idleFull && <Overview notes={visible} filter={filter} archive={archive} onOpen={(nid) => go(nid)} />}
        </div>)}
      {keep && !pane && id && <Dialog title="Note" wide onClose={close}>{editor}</Dialog>}
      {editingTag && <TagDialog tag={editingTag} onClose={() => setEditingTag(null)} onDone={() => { const gone = editingTag.title === filter.tag; setEditingTag(null); void refreshMeta(); if (gone) go(id, { tag: undefined }); void load(); }} />}
      {item.ui}
    </>
  );
}

/** The right-hand side while nothing is open: what is due and what is pinned. */
function Overview({ notes, filter, archive, onOpen }: { notes: Note[]; filter: HomeFilter; archive: boolean; onOpen: (id: string) => void }) {
  const due = notes.filter((n) => n.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 6);
  const pinned = notes.filter((n) => n.pinned).slice(0, 6);
  const Item = ({ n }: { n: Note }) => <li><button className="w-full truncate rounded-theme px-2 py-2 text-left text-sm hover:bg-raised" onClick={() => onOpen(n.id)}>{titleOf(n)}</button></li>;
  return (
    <aside className="hidden min-w-0 space-y-4 md:col-start-2 md:block lg:col-start-3" aria-label="Overview">
      <div className="card space-y-1 p-4"><h2 className="font-semibold">{archive ? 'Things you are done with' : 'Type to add, tap to read'}</h2>
        <p className="text-sm text-muted">{notes.length} here{filter.scope === 'list' && !filter.tag ? (archive ? ' finished' : ' on your list') : ''}. {archive ? 'The archive is organised like Home: the same tabs, tags and orders. Open an item to read it, or untick a finished task to bring it back.' : 'Add something in the box above; press Tab for a description. Tap an item to read it in place, or the pencil to edit it.'}</p>
        <p className="flex items-center gap-1 pt-1 text-xs text-muted"><Plus size={12} />Right-click (or hold) an item to pin, file, link, download or bin it.</p></div>
      {!archive && due.length > 0 && <div className="card p-3"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Coming up</h3><ul>{due.map((n) => <Item key={n.id} n={n} />)}</ul></div>}
      {pinned.length > 0 && <div className="card p-3"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Pinned</h3><ul>{pinned.map((n) => <Item key={n.id} n={n} />)}</ul></div>}
    </aside>
  );
}

/**
 * The Keep wall: cards in as many columns as fit, each column filled on its own so the cards sit against each other (no gaps from a tall neighbour).
 * Item 1 goes to the first column, item 2 to the second ... then back to the first, so the order still reads left to right.
 */
function Wall({ items, render, minRem, gapRem }: { items: Note[]; render: (n: Note) => ReactNode; minRem: number; gapRem: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => { const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, gap = gapRem * rem; setCols(Math.max(1, Math.floor((el.clientWidth + gap) / (minRem * rem + gap)))); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [minRem, gapRem]);
  return (
    <div ref={box} className="flex items-start" style={{ gap: `${gapRem}rem` }}>
      {Array.from({ length: cols }, (_, c) => <ul key={c} className="flex min-w-0 flex-1 flex-col" style={{ gap: `${gapRem}rem` }}>{items.filter((_n, i) => i % cols === c).map(render)}</ul>)}
    </div>
  );
}


/** A red-tinted bar along the bottom of the editor column, just above the dock, that closes the editor (it sticks to the bottom while the editor scrolls). */
function CloseBar({ onClose }: { onClose: () => void }) {
  return <button type="button" onClick={onClose} className="sticky bottom-0 z-10 mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-theme border border-line bg-raised/80 py-2.5 text-sm font-medium text-muted backdrop-blur transition-colors hover:bg-raised hover:text-fg md:mt-2" aria-label="Close the editor"><X size={16} />Close the editor</button>;
}
