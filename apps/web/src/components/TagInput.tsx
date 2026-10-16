import { useMemo, useState } from 'react';
import { Emoji } from '../lib/emoji.tsx';
import { X } from 'lucide-react';
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { TagChip } from './TagChip.tsx';

export const cleanTag = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 80);

/** One tag chip that can be dragged to a new place among the others (a mouse drags it anywhere; a finger holds it for a moment first, so scrolling still works). */
function DraggableChip({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  const s = useSortable({ id: tag });
  return (
    <span ref={s.setNodeRef} {...s.attributes} {...s.listeners} style={{ transform: CSS.Translate.toString(s.transform), transition: s.transition, zIndex: s.isDragging ? 20 : undefined, opacity: s.isDragging ? 0.85 : 1, cursor: 'grab', touchAction: 'manipulation' }} className="inline-flex" title="Drag to reorder">
      <TagChip title={tag}><button type="button" className="-mr-0.5 rounded p-0.5 hover:text-bad" aria-label={`Remove tag ${tag}`} onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}><X size={12} /></button></TagChip>
    </span>
  );
}

/**
 * Tags as chips with a field after them. Drag a chip to put the tags in another order. Enter (or a comma) adds exactly what was typed; Tab (Shift+Tab back)
 * or the arrow keys walk down the list of your tags and Enter adds the one that is lit; Backspace on an empty field takes the last one off; leaving the
 * field adds what is typed, so nothing typed is lost.
 */
export function TagInput({ value, onChange, placeholder = 'Add a tag, press Enter', autoFocus, onDraft, className, big }: {
  value: string[]; onChange: (next: string[]) => void; placeholder?: string; autoFocus?: boolean; onDraft?: (draft: string) => void; className?: string; big?: boolean;
}) {
  const all = useStore((s) => s.tags);
  const [draft, setDraftState] = useState('');
  const [hi, setHi] = useState(-1);
  const [focus, setFocus] = useState(false);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }));
  const reorder = (e: DragEndEvent) => { const from = value.indexOf(String(e.active.id)), to = e.over ? value.indexOf(String(e.over.id)) : -1; if (from >= 0 && to >= 0 && from !== to) onChange(arrayMove(value, from, to)); };
  const setDraft = (d: string) => { setDraftState(d); setHi(-1); onDraft?.(d); };
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return all.filter((t) => !t.retired && !value.includes(t.title) && (!q || t.title.toLowerCase().includes(q))).slice(0, q ? 6 : 8);
  }, [all, value, draft]);
  const showList = focus && (!!draft.trim() || !big); // the picker window already lists every tag below the field
  const add = (raw: string) => {
    const t = cleanTag(raw);
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className={cn('relative', className)}>
      <div className={cn('input flex flex-wrap items-center gap-1.5 !py-1.5', big && '!min-h-12')} onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
          <SortableContext items={value} strategy={horizontalListSortingStrategy}>
            {value.map((t) => <DraggableChip key={t} tag={t} onRemove={() => onChange(value.filter((x) => x !== t))} />)}
          </SortableContext>
        </DndContext>
        <input
          className="min-w-[7rem] flex-1 bg-transparent py-1 text-sm outline-none" aria-label="Add a tag" placeholder={value.length ? 'Add another' : placeholder} value={draft} autoFocus={autoFocus}
          enterKeyHint="done" autoCapitalize="none" autoComplete="off"
          onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) add(v.slice(0, -1)); else setDraft(v); }}
          onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); if (draft.trim()) add(draft); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(hi >= 0 && suggestions[hi] ? suggestions[hi]!.title : draft); }
            else if (e.key === 'Tab' && showList && suggestions.length && (e.shiftKey ? hi >= 0 : hi < suggestions.length - 1)) { e.preventDefault(); setHi((h) => (e.shiftKey ? h - 1 : h + 1)); }
            else if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setHi((h) => Math.min(suggestions.length - 1, h + 1)); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
            else if (e.key === 'Escape' && draft) { e.preventDefault(); e.stopPropagation(); setDraft(''); }
          }} />
      </div>
      {showList && suggestions.length > 0 && (
        <div className="bt-menu absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto py-1" role="listbox" aria-label="Suggestions">
          {suggestions.map((t, i) => (
            <button key={t.title} type="button" role="option" aria-selected={i === hi} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', i === hi && 'bt-select-hi')} onMouseDown={(e) => { e.preventDefault(); add(t.title); }}>
              {t.emoji && <Emoji value={t.emoji} />}<span className="min-w-0 flex-1 truncate">{t.title}</span>
            </button>))}
        </div>)}
    </div>
  );
}
