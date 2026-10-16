import { useCallback, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, CalendarDays, CheckCircle2, Download, ExternalLink, Link2, ListChecks, Pin, PinOff, RotateCcw, Tags, Trash2, Undo2 } from 'lucide-react';
import { api, saveBlob, type Note } from './api.ts';
import { useStore } from './store.ts';
import { copyNoteLink, patchNote } from './actions.ts';
import { ContextMenu, type MenuItem } from '../components/ContextMenu.tsx';
import { TagPicker } from '../components/TagPicker.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { titleOf, type ItemRowProps } from '../components/ItemRow.tsx';
import { toLocalInput } from './dates.ts';

export type Pile = 'live' | 'archive' | 'bin';

const finishMs = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : document.documentElement.dataset.ui === 'liquid' ? 950 : 480);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * What every list of items does with an item: finish it (with the animation, then an Undo), the menu (right click, long press, the "more" button), send it to
 * tags, set a date, copy its link, download it, bin it. Home, the archive and the bin all use it, so an item behaves the same wherever you see it.
 * `ui` goes anywhere in the page (it draws the menu and the windows); `rowProps(n)` is what an ItemRow needs.
 */
export function useItemUi({ pile, open, closeIfOpen }: { pile: Pile; open: (id: string) => void; closeIfOpen: (id: string) => void }) {
  const toast = useStore((s) => s.toast);
  const [menu, setMenu] = useState<{ n: Note; x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<{ n: Note; send: boolean } | null>(null);
  const [dueFor, setDueFor] = useState<Note | null>(null);
  const [finishing, setFinishing] = useState<ReadonlySet<string>>(new Set());

  const undoable = useCallback((message: string, undo: () => void) => toast(message, { action: { label: 'Undo', run: undo } }), [toast]);

  /** ticking the box: play the animation, then archive. Ticking a finished one (archive, search) reopens it at once. */
  const toggleDone = useCallback(async (n: Note) => {
    if (n.archived) { void patchNote(n.id, { archived: false }); return; }
    setFinishing((s) => new Set(s).add(n.id));
    await wait(finishMs());
    const ok = await patchNote(n.id, { archived: true });
    setFinishing((s) => { const x = new Set(s); x.delete(n.id); return x; });
    if (ok) undoable(`Archived “${titleOf(n)}”`, () => void patchNote(n.id, { archived: false, onList: n.onList })); // a task that was sent to its tags comes back as a task
  }, [undoable]);

  const sendToTasks = useCallback(async (n: Note) => { const ok = await patchNote(n.id, { onList: true }); if (ok) undoable(`Sent “${titleOf(n)}” to your tasks`, () => void patchNote(n.id, { onList: false })); }, [undoable]);
  /** a task that already has tags goes straight to them; one without tags asks which */
  const sendToTags = useCallback(async (n: Note) => {
    if (!n.tags.length) { setPicker({ n, send: true }); return; }
    const ok = await patchNote(n.id, { onList: false });
    if (ok) undoable(`Sent “${titleOf(n)}” to ${n.tags.map((t) => t.split('.').pop()).join(', ')}`, () => void patchNote(n.id, { onList: true }));
  }, [undoable]);
  const bin = useCallback((n: Note) => { closeIfOpen(n.id); void patchNote(n.id, { trashed: true }).then((ok) => ok && undoable(`Moved “${titleOf(n)}” to the bin`, () => void patchNote(n.id, { trashed: false }))); }, [undoable, closeIfOpen]);
  const download = async (n: Note) => {
    const full = (await api.noteOrNull(n.id)) ?? n;
    saveBlob(new Blob([full.text], { type: 'text/plain;charset=utf-8' }), `${(full.title || 'note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.${full.noteType === 'markdown' ? 'md' : 'txt'}`);
  };

  const itemsFor = (n: Note): MenuItem[] => {
    const link: MenuItem = { key: 'link', label: 'Copy link', icon: <Link2 size={15} />, onSelect: () => void copyNoteLink(n.id) };
    if (pile === 'bin') return [
      { key: 'restore', label: 'Restore', icon: <Undo2 size={15} />, onSelect: () => void patchNote(n.id, { trashed: false }) }, link,
      { key: 'del', label: 'Delete forever', icon: <Trash2 size={15} />, danger: true, divider: true, onSelect: async () => { if (confirm(`Delete “${titleOf(n)}” for good?`)) { await api.deleteNote(n.id); useStore.getState().removeNote(n.id); closeIfOpen(n.id); void useStore.getState().refreshMeta(); } } },
    ];
    return [
      { key: 'open', label: 'Open', icon: <ExternalLink size={15} />, onSelect: () => open(n.id) },
      { key: 'pin', label: n.pinned ? 'Unpin' : 'Pin to the top', icon: n.pinned ? <PinOff size={15} /> : <Pin size={15} />, onSelect: () => void patchNote(n.id, { pinned: !n.pinned }) },
      n.onList
        ? { key: 'send', label: n.tags.length ? 'Send to tags' : 'Send to tags…', icon: <Tags size={15} />, onSelect: () => void sendToTags(n) }
        : { key: 'send', label: 'Send to tasks', icon: <ListChecks size={15} />, onSelect: () => void sendToTasks(n) },
      { key: 'tags', label: n.tags.length ? 'Change tags…' : 'Add tags…', icon: <Tags size={15} />, onSelect: () => setPicker({ n, send: false }) },
      { key: 'due', label: n.dueDate ? 'Change the date…' : 'Set a date…', icon: <CalendarDays size={15} />, onSelect: () => setDueFor(n) },
      { key: 'dl', label: 'Download', icon: <Download size={15} />, divider: true, onSelect: () => void download(n) },
      // archiving is what finishing a task is called; a task has a tick for its icon, a note an archive box
      { key: 'done', label: n.archived ? 'Unarchive' : 'Archive', icon: n.archived ? (n.onList ? <RotateCcw size={15} /> : <ArchiveRestore size={15} />) : (n.onList ? <CheckCircle2 size={15} /> : <Archive size={15} />),
        onSelect: () => (n.onList ? void toggleDone(n) : void patchNote(n.id, { archived: !n.archived })) },
      link,
      { key: 'bin', label: 'Move to the bin', icon: <Trash2 size={15} />, danger: true, divider: true, onSelect: () => bin(n) },
    ];
  };

  const ui: ReactNode = (
    <>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={itemsFor(menu.n)} label={`Menu for ${titleOf(menu.n)}`} onClose={() => setMenu(null)} />}
      {picker && <TagPicker initial={picker.n.tags} send={picker.send} title={picker.send ? 'Send to tags' : 'Tags'} onClose={() => setPicker(null)}
        onDone={(tags) => { const { n, send } = picker; setPicker(null); void patchNote(n.id, send && tags.length ? { tags, onList: false } : { tags }).then((ok) => ok && tags.length && send && toast(`Sent to ${tags.join(', ')}`)); }} />}
      {dueFor && <DueDialog n={dueFor} onClose={() => setDueFor(null)} onDone={(iso) => { const n = dueFor; setDueFor(null); void patchNote(n.id, { dueDate: iso }); }} />}
    </>
  );

  const rowProps = (n: Note): Pick<ItemRowProps, 'finishing' | 'onToggleDone' | 'onMenu' | 'onSendToTags' | 'onSendToTasks' | 'onChangeTags' | 'onProgress' | 'onDue' | 'hideCheck'> => ({
    finishing: finishing.has(n.id), hideCheck: pile === 'bin',
    onToggleDone: () => void toggleDone(n), onMenu: (x, y) => setMenu({ n, x, y }), onSendToTags: () => void sendToTags(n), onSendToTasks: () => void sendToTasks(n), onChangeTags: () => setPicker({ n, send: false }),
    onProgress: (v) => void patchNote(n.id, { percentDone: v }), onDue: (iso) => void patchNote(n.id, { dueDate: iso }),
  });
  return { ui, rowProps, toggleDone, finishing };
}

function DueDialog({ n, onClose, onDone }: { n: Note; onClose: () => void; onDone: (iso: string | null) => void }) {
  const [v, setV] = useState(toLocalInput(n.dueDate).slice(0, 10));
  return (
    <Dialog title="Date" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onDone(v ? new Date(`${v}T12:00`).toISOString() : null); }}>
        <input type="date" className="input !min-h-12 text-base" autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label="Date" />
        <div className="flex gap-2"><button className="btn btn-accent !min-h-11 flex-1">Save</button>{n.dueDate && <button type="button" className="btn !min-h-11" onClick={() => onDone(null)}>Clear</button>}</div>
      </form>
    </Dialog>
  );
}
