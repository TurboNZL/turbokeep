import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { TagChip } from './TagChip.tsx';

export const cleanTag = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 80);

/**
 * Tags as chips with a field after them. Enter (or a comma) adds exactly what was typed; the arrow keys pick one of the suggestions first if you
 * want an existing tag; Backspace on an empty field takes the last one off; leaving the field adds what is typed, so nothing typed is lost.
 */
export function TagInput({ value, onChange, placeholder = 'Add a tag, press Enter', autoFocus, onDraft, className, big }: {
  value: string[]; onChange: (next: string[]) => void; placeholder?: string; autoFocus?: boolean; onDraft?: (draft: string) => void; className?: string; big?: boolean;
}) {
  const all = useStore((s) => s.tags);
  const [draft, setDraftState] = useState('');
  const [hi, setHi] = useState(-1);
  const [focus, setFocus] = useState(false);
  const setDraft = (d: string) => { setDraftState(d); setHi(-1); onDraft?.(d); };
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return all.filter((t) => !value.includes(t.title) && (!q || t.title.toLowerCase().includes(q))).slice(0, 6);
  }, [all, value, draft]);
  const add = (raw: string) => {
    const t = cleanTag(raw);
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className={cn('relative', className)}>
      <div className={cn('input flex flex-wrap items-center gap-1.5 !py-1.5', big && '!min-h-12')} onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
        {value.map((t) => <TagChip key={t} title={t}><button type="button" className="-mr-0.5 rounded p-0.5 hover:text-bad" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} /></button></TagChip>)}
        <input
          className="min-w-[7rem] flex-1 bg-transparent py-1 text-sm outline-none" aria-label="Add a tag" placeholder={value.length ? 'Add another' : placeholder} value={draft} autoFocus={autoFocus}
          enterKeyHint="done" autoCapitalize="none" autoComplete="off"
          onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) add(v.slice(0, -1)); else setDraft(v); }}
          onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); if (draft.trim()) add(draft); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(hi >= 0 && suggestions[hi] ? suggestions[hi]!.title : draft); }
            else if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setHi((h) => Math.min(suggestions.length - 1, h + 1)); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
            else if (e.key === 'Escape' && draft) { e.preventDefault(); e.stopPropagation(); setDraft(''); }
          }} />
      </div>
      {focus && draft.trim() && suggestions.length > 0 && (
        <div className="bt-menu absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto py-1" role="listbox" aria-label="Suggestions">
          {suggestions.map((t, i) => (
            <button key={t.title} type="button" role="option" aria-selected={i === hi} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', i === hi && 'bt-select-hi')} onMouseDown={(e) => { e.preventDefault(); add(t.title); }}>
              {t.emoji && <span aria-hidden>{t.emoji}</span>}<span className="min-w-0 flex-1 truncate">{t.title}</span>
            </button>))}
        </div>)}
    </div>
  );
}
