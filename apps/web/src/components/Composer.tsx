import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import { api, type Note } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { pokeWidgets } from '../lib/actions.ts';
import { cn } from '../lib/cn.ts';
import { TagPicker } from './TagPicker.tsx';
import { AutoText } from './AutoText.tsx';
import { markFresh } from '../lib/fresh.ts';
import { wantEditorFocus, typeAhead } from '../lib/focus.ts';
import { rememberNote } from '../lib/cache.ts';
import { excerpt } from '../lib/actions.ts';
import { titleOverflow } from '../lib/title.ts';

/** The Add button elsewhere in the app asks for the focus with this (it works from Settings too: the request waits until Home is on screen). */
let wanted = false;
export function requestCompose() { wanted = true; window.dispatchEvent(new Event('tk:compose')); }

/**
 * Where things start. Type, press Enter: it is on your Home list (a task by default). Shift+Enter starts a new line in the title. Type a title and the description box appears: press Tab to go to it. Click away and what you
 * typed is kept, so nothing is lost. "Send to tags" files it straight away under as many tags as you like instead (it leaves the list and is found
 * by its tags). Ctrl+Enter in the description adds it too. Inside a tag, new things start with that tag.
 */
export function Composer({ tag, autoFocus, onAdded, onPopup }: { tag?: string; autoFocus?: boolean; onAdded: (n: Note) => void; /** Keep views with "open on the first letter": called with the item made from that letter, to open it */ onPopup?: (n: Note) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const titleEl = useRef<HTMLTextAreaElement>(null);
  const textEl = useRef<HTMLTextAreaElement>(null);
  const toast = useStore((s) => s.toast);
  const draft = useRef({ title, text }); draft.current = { title, text };
  const pickingRef = useRef(false); pickingRef.current = picking;
  const sending = useRef(false);
  const auto = useRef(false); // the title is the date the app put there (a long title moved into the description)
  const caret = useRef<number | null>(null); // after a long title moved into the description: where typing goes on
  useEffect(() => { if (caret.current !== null && textEl.current) { const c = caret.current; caret.current = null; textEl.current.focus(); textEl.current.setSelectionRange(c, c); } });
  const pressing = useRef(false);

  useEffect(() => {
    const focus = () => { if (wanted) { wanted = false; titleEl.current?.focus(); titleEl.current?.scrollIntoView({ block: 'nearest' }); } };
    focus();
    window.addEventListener('tk:compose', focus);
    return () => window.removeEventListener('tk:compose', focus);
  }, []);

  /** Keep views: the first letter makes the item and opens it at once (with the cursor after that letter in its title) */
  const popping = useRef(false);
  /** after the first letter made the item: the box keeps showing `base` (what the item's title already is) until the editor has the cursor; letters typed meanwhile are passed on to it */
  const handoff = useRef<{ id: string; base: string; until: number } | null>(null);
  const popup = (first: string) => {
    // nothing waits for the server: the item is shown and its editor opens in this very keystroke; the server is told in the background (the page chose the id)
    const stamp = new Date().toISOString();
    const over = titleOverflow(first, ''); // a long paste is not a title: it is the text, under the date title
    const shown: Note = { id: crypto.randomUUID(), title: over ? over.title : first, text: over ? over.text : '', autoTitle: !!over, noteType: 'plain-text', pinned: false, archived: false, trashed: false, onList: !tag, dueDate: null, percentDone: 0, position: 0, tags: tag ? [tag] : [], createdAt: stamp, updatedAt: stamp };
    popping.current = true;
    handoff.current = { id: shown.id, base: first, until: Date.now() + 1500 };
    const ending = window.setInterval(() => { const h = handoff.current; if (h && Date.now() < h.until && document.activeElement === titleEl.current) return; window.clearInterval(ending); if (handoff.current === h) { handoff.current = null; auto.current = false; setTitle(''); setText(''); draft.current = { title: '', text: '' }; } }, 40);
    markFresh(shown.id);
    rememberNote(shown); // the editor opens from this copy, so the cursor is in its title before the next letter
    onAdded(excerpt(shown)); wantEditorFocus(shown.id); onPopup?.(shown);
    popping.current = false;
    api.createNoteNow(shown).then((n) => { const cur = useStore.getState().notes.find((x) => x.id === n.id); useStore.getState().upsertNote(cur ? { ...excerpt(n), title: cur.title, text: cur.text } : excerpt(n)); /* what was typed since stays */ void useStore.getState().refreshMeta(); pokeWidgets(); }).catch((e: Error) => {
      useStore.getState().removeNote(shown.id);
      toast(e.message || 'Could not add that', { tone: 'bad' });
    });
  };

  /** keep=false: the item goes to the tags only (not on the list). Without tags it goes on the list. */
  const commit = useCallback(async (extraTags: string[] = [], keepOnList = true) => {
    const { title: t0, text: x0 } = draft.current;
    const typedTitle = t0.trim(), typedText = x0.trim();
    if (!typedTitle && !typedText) return null;
    // only a description typed: its first line becomes the title
    const [first = '', ...rest] = typedText.split('\n');
    const t = typedTitle || first, body = typedTitle ? typedText : rest.join('\n').trim();
    if (sending.current || popping.current || handoff.current) return null;
    sending.current = true; setBusy(true);
    try {
      const tags = [...new Set([...(tag ? [tag] : []), ...extraTags])];
      const n = await api.createNote({ title: t, text: body, tags, onList: tag ? false : keepOnList, autoTitle: auto.current && !!typedTitle });
      auto.current = false; setTitle(''); setText(''); draft.current = { title: '', text: '' };
      void useStore.getState().refreshMeta(); pokeWidgets();
      markFresh(n.id); onAdded(n);
      return n;
    } catch (e) { toast((e as Error).message || 'Could not add that', { tone: 'bad' }); return null; }
    finally { sending.current = false; setBusy(false); }
  }, [tag, onAdded, toast]);

  return (
    // Tab goes from the title straight to the description (the Add button is out of the tab order: Enter adds). Leaving the box adds what was typed,
    // except while a finger or the mouse is still pressing something inside it (Safari does not focus a button that is clicked, so relatedTarget is empty then)
    <div ref={box} className="card tk-compose space-y-2 p-3 max-md:fixed max-md:inset-x-2 max-md:z-30 max-md:shadow-2xl" style={{ bottom: 'calc(var(--dock-h, 0px) + 0.5rem)' }}
      onPointerDownCapture={() => { pressing.current = true; }} onPointerUpCapture={() => window.setTimeout(() => { pressing.current = false; }, 0)}
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node) && !pickingRef.current && !pressing.current) void commit(); }}>
      <div className="flex items-center gap-2">
        <AutoText ref={titleEl} className="input !min-h-11 max-h-48 flex-1 resize-none !py-2.5 !text-base" aria-label="Add something" placeholder={tag ? `Add to ${tag.split('.').pop()}…` : 'Add something…'} value={title} autoFocus={autoFocus}
          enterKeyHint="done" autoComplete="off" onPaste={(e) => { const t = e.clipboardData.getData('text/plain'); if (onPopup && ((!title && !text) || handoff.current) && t.trim()) { e.preventDefault(); const h = handoff.current; if (h) typeAhead(h.id, t); else popup(t); } }} onChange={(e) => { const h = handoff.current; if (h) { const v = e.target.value; const added = v.startsWith(h.base) ? v.slice(h.base.length) : v; if (added) typeAhead(h.id, added); setTitle(h.base); return; } if (onPopup && !title && !text && e.target.value.trim() && !popping.current) { setTitle(e.target.value); draft.current = { title: e.target.value, text: '' }; popup(e.target.value); return; } const o = titleOverflow(e.target.value, text, e.target.selectionStart); if (o) { setTitle(o.title); setText(o.text); caret.current = o.caret; auto.current = true; } else { setTitle(e.target.value); if (popping.current) draft.current = { title: e.target.value, text: '' }; auto.current = false; } }}
          // With "open as you type" the box only intercepts: a printable key (or a paste) never lands in it, it goes straight to the item's own editor (a phone's on-screen keyboard
          // sends no usable key here, so it still goes through onChange above)
          onKeyDown={(e) => {
            if (onPopup && ((!title && !text) || handoff.current) && !e.nativeEvent.isComposing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.trim() || handoff.current)) {
              e.preventDefault();
              const h = handoff.current; if (h) typeAhead(h.id, e.key); else popup(e.key);
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void commit().then(() => titleEl.current?.focus()); } }} />
        <button type="button" tabIndex={-1} className="btn btn-accent !min-h-11 !px-3" aria-label="Add" title="Add (Enter)" disabled={busy || (!title.trim() && !text.trim())} onClick={() => void commit().then(() => titleEl.current?.focus())}><Plus size={18} /></button>
      </div>
      {(title || text) && <textarea ref={textEl} className="input note-text min-h-[4.5rem] w-full resize-none !py-2 text-sm" rows={Math.min(8, text.split('\n').length + 1)}
        aria-label="Description (optional)" placeholder="Description: press Tab after the title" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void commit().then(() => titleEl.current?.focus()); } }} />}
      {(title.trim() || text.trim()) && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn !min-h-11 flex-1 sm:flex-none" disabled={busy} onClick={() => setPicking(true)}><Tags size={16} />Send to tags</button>
          <span className="hidden text-xs text-muted sm:inline">Enter adds it to your list · click away keeps it too</span>
        </div>)}
      {picking && <TagPicker initial={[]} title="Send to tags" onClose={() => { setPicking(false); titleEl.current?.focus(); }}
        onDone={(tags) => { setPicking(false); void commit(tags, tags.length === 0).then((n) => { if (n && tags.length) toast(`Sent to ${tags.join(', ')}`); titleEl.current?.focus(); }); }} />}
    </div>
  );
}
