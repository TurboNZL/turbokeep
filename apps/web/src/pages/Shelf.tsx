import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { useItemUi, type Pile } from '../lib/useItemUi.tsx';
import { homeLink } from '../lib/views.ts';
import { ItemRow } from '../components/ItemRow.tsx';
import { OtherPiles } from '../components/OtherPiles.tsx';

/** The bin: the same items and the same menu as Home, without the composer. (The Archive is Home's own page, see HomePage.) */
export function ShelfPage({ pile }: { pile: 'bin' }) {
  const nav = useNavigate();
  const q = useSearchParams()[0].get('q') ?? '';
  const { notes, setNotes, setOpenNote } = useStore();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const view = pile === 'bin' ? 'trashed' : 'archived';
  const load = useCallback(async () => {
    try { setNotes(await api.notes({ view, excerpt: '1', q })); setError(''); setLoaded(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
  }, [view, q, setNotes]);
  useEffect(() => { setNotes([]); setLoaded(false); void load(); }, [load, setNotes]);
  const open = useCallback((id: string) => { setOpenNote(id); nav(homeLink(id)); }, [nav, setOpenNote]);
  const item = useItemUi({ pile, open, closeIfOpen: () => {} });
  const shown = useMemo(() => notes.filter((n) => (pile === 'bin' ? n.trashed : n.archived && !n.trashed)), [notes, pile]);
  return (
    <section className="mx-auto max-w-3xl space-y-3" aria-label={pile === 'bin' ? 'Bin' : 'Archive'}>
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">{pile === 'bin' ? 'Bin' : 'Archive'}</h1>
        {pile === 'bin' && shown.length > 0 && <button className="btn text-bad" onClick={async () => { if (confirm(`Delete ${shown.length} item${shown.length === 1 ? '' : 's'} for good?`)) { await api.emptyTrash(); void useStore.getState().refreshMeta(); await load(); } }}><Trash2 size={15} />Empty the bin</button>}
      </div>
      <p className="text-sm text-muted">{pile === 'bin' ? 'Items you threw away. Restore one from its menu, or empty the bin to delete them for good.' : 'Everything you finished or put away. Untick a finished task to bring it back to your list.'}</p>
      {q && <><p className="text-sm text-muted">Results for “{q}” in the Bin <button className="underline" onClick={() => nav('/bin')}>clear</button></p><OtherPiles q={q} from="bin" seed={shown.length} /></>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <ul className="space-y-1.5">{shown.map((n) => <ItemRow key={n.id} n={n} variant="row" onOpen={() => open(n.id)} {...item.rowProps(n)} />)}</ul>
      {loaded && !shown.length && !error && <p className="py-8 text-center text-sm text-muted">{pile === 'bin' ? 'The bin is empty.' : 'Nothing finished or archived yet.'}</p>}
      {item.ui}
    </section>
  );
}
