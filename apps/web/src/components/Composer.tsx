import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import { api, type Note } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { pokeWidgets } from '../lib/actions.ts';
import { cn } from '../lib/cn.ts';
import { TagPicker } from './TagPicker.tsx';

/** The Add button elsewhere in the app asks for the focus with this (it works from Settings too: the request waits until Home is on screen). */
let wanted = false;
export function requestCompose() { wanted = true; window.dispatchEvent(new Event('tk:compose')); }

/**
 * Where things start. Type, press Enter: it is on your Home list (a task by default). Press Tab once to type a description. Click away and what you
 * typed is kept, so nothing is lost. "Send to tags" files it straight away under as many tags as you like instead (it leaves the list and is found
 * by its tags). Ctrl+Enter in the description adds it too. Inside a tag, new things start with that tag.
 */
export function Composer({ tag, autoFocus, onAdded }: { tag?: string; autoFocus?: boolean; onAdded: (n: Note) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const titleEl = useRef<HTMLInputElement>(null);
  const textEl = useRef<HTMLTextAreaElement>(null);
  const toast = useStore((s) => s.toast);
  const draft = useRef({ title, text }); draft.current = { title, text };
  const pickingRef = useRef(false); pickingRef.current = picking;
  const sending = useRef(false);
  const pressing = useRef(false);

  useEffect(() => {
    const focus = () => { if (wanted) { wanted = false; titleEl.current?.focus(); titleEl.current?.scrollIntoView({ block: 'nearest' }); } };
    focus();
    window.addEventListener('tk:compose', focus);
    return () => window.removeEventListener('tk:compose', focus);
  }, []);

  /** keep=false: the item goes to the tags only (not on the list). Without tags it goes on the list. */
  const commit = useCallback(async (extraTags: string[] = [], keepOnList = true) => {
    const { title: t0, text: x0 } = draft.current;
    const typedTitle = t0.trim(), typedText = x0.trim();
    if (!typedTitle && !typedText) return null;
    // only a description typed: its first line becomes the title
    const [first = '', ...rest] = typedText.split('\n');
    const t = typedTitle || first.slice(0, 120), body = typedTitle ? typedText : rest.join('\n').trim();
    if (sending.current) return null;
    sending.current = true; setBusy(true);
    try {
      const tags = [...new Set([...(tag ? [tag] : []), ...extraTags])];
      const n = await api.createNote({ title: t, text: body, tags, onList: tag ? false : keepOnList });
      setTitle(''); setText(''); draft.current = { title: '', text: '' };
      void useStore.getState().refreshMeta(); pokeWidgets();
      onAdded(n);
      return n;
    } catch (e) { toast((e as Error).message || 'Could not add that', { tone: 'bad' }); return null; }
    finally { sending.current = false; setBusy(false); }
  }, [tag, onAdded, toast]);

  return (
    // Tab goes from the title straight to the description (the Add button is out of the tab order: Enter adds). Leaving the box adds what was typed,
    // except while a finger or the mouse is still pressing something inside it (Safari does not focus a button that is clicked, so relatedTarget is empty then)
    <div ref={box} className="card tk-compose space-y-2 p-3"
      onPointerDownCapture={() => { pressing.current = true; }} onPointerUpCapture={() => window.setTimeout(() => { pressing.current = false; }, 0)}
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node) && !pickingRef.current && !pressing.current) void commit(); }}>
      <div className="flex items-center gap-2">
        <input ref={titleEl} className="input !min-h-11 flex-1 !text-base" aria-label="Add something" placeholder={tag ? `Add to ${tag.split('.').pop()}…` : 'Add something…'} value={title} autoFocus={autoFocus}
          enterKeyHint="done" autoComplete="off" onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void commit().then(() => titleEl.current?.focus()); } }} />
        <button type="button" tabIndex={-1} className="btn btn-accent !min-h-11 !px-3" aria-label="Add" title="Add (Enter)" disabled={busy || (!title.trim() && !text.trim())} onClick={() => void commit().then(() => titleEl.current?.focus())}><Plus size={18} /></button>
      </div>
      <textarea ref={textEl} className={cn('input note-text w-full resize-none !py-2 text-sm transition-[min-height]', text || title ? 'min-h-[4.5rem]' : 'min-h-0 !py-1.5')} rows={text ? Math.min(8, text.split('\n').length + 1) : title ? 3 : 1}
        aria-label="Description (optional)" placeholder="Description: press Tab after the title" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void commit().then(() => titleEl.current?.focus()); } }} />
      {(title.trim() || text.trim()) && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn !min-h-11 flex-1 sm:flex-none" disabled={busy} onClick={() => setPicking(true)}><Tags size={16} />Send to tags</button>
          <span className="hidden text-xs text-muted sm:inline">Enter adds it to your list · click away keeps it too</span>
        </div>)}
      {picking && <TagPicker initial={[]} keepOnList={false} title="Send to tags" onClose={() => { setPicking(false); titleEl.current?.focus(); }}
        onDone={(tags, keep) => { setPicking(false); void commit(tags, keep || tags.length === 0).then((n) => { if (n && tags.length) toast(`Filed under ${tags.join(', ')}`); titleEl.current?.focus(); }); }} />}
    </div>
  );
}
