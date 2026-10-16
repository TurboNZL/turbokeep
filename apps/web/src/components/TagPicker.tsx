import { useState } from 'react';
import { Emoji } from '../lib/emoji.tsx';
import { Check, Tags } from 'lucide-react';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { Dialog } from './Dialog.tsx';
import { TagInput } from './TagInput.tsx';

/**
 * "Send to tags": the big, plain way to file something. Every tag is a large button you can tap, type a new one (Enter adds it), pick as many as you like,
 * then press the one big button. Sending an item to tags takes it off the task list (it is now a note you will find under its tags).
 */
export function TagPicker({ title = 'Send to tags', initial, send = true, onDone, onClose }: {
  title?: string; initial: string[]; /** true: the item leaves the task list for these tags; false: only its tags change */ send?: boolean;
  onDone: (tags: string[]) => void; onClose: () => void;
}) {
  const all = useStore((s) => s.tags);
  const [sel, setSel] = useState<string[]>(initial);
    const [draft, setDraft] = useState('');
  const toggle = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const shown = all.filter((t) => (!t.retired || sel.includes(t.title)) && (!draft.trim() || t.title.toLowerCase().includes(draft.trim().toLowerCase())));
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onDone(sel); } }}>
        <TagInput big autoFocus value={sel} onChange={setSel} onDraft={setDraft} placeholder="Type a new tag, press Enter" />
        {all.length > 0 && (
          <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" role="group" aria-label="Your tags">
            {shown.map((t) => {
              const on = sel.includes(t.title);
              return (
                <button key={t.title} type="button" aria-pressed={on} onClick={() => toggle(t.title)}
                  className={cn('btn !min-h-12 justify-start gap-2 !px-3 text-left', on && 'btn-accent')} style={t.color && !on ? { boxShadow: `inset 4px 0 0 #${t.color}` } : undefined}>
                  {on ? <Check size={16} className="shrink-0" /> : t.emoji ? <span className="grid w-4 shrink-0 place-items-center text-center"><Emoji value={t.emoji} /></span> : <span className="w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                </button>);
            })}
            {!shown.length && <p className="col-span-full text-sm text-muted">No tag matches. Press Enter to make “{draft.trim()}”.</p>}
          </div>)}
        <button type="button" className="btn btn-accent w-full !min-h-14 text-base font-semibold" onClick={() => onDone(sel)}>
          <Tags size={18} />{sel.length ? (send ? `Send to ${sel.length} tag${sel.length === 1 ? '' : 's'}` : `Save ${sel.length} tag${sel.length === 1 ? '' : 's'}`) : 'Done'}
        </button>
      </div>
    </Dialog>
  );
}
