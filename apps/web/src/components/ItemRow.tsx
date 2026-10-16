import { useMemo, useState, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
import { Calendar, ChevronRight, Clock, GripVertical, MoreHorizontal, Pin, Tags } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { fmtDay, fmtShort, isOverdue, toLocalInput } from '../lib/dates.ts';
import { firstLine, renderMarkdown } from '../lib/markdown.ts';
import type { Note } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { looksOf, stripe, wash } from '../lib/tagLook.ts';
import { useLongPress } from '../lib/useLongPress.ts';
import { TagChip } from './TagChip.tsx';

/** a short name for labels, menus and toasts */
export const titleOf = (n: Note) => n.title.trim().split('\n')[0]?.slice(0, 80) || n.text.trim().split('\n')[0]?.slice(0, 80) || 'Untitled';
/** the title as shown: whole, every line of it (the first line of the description stands in for a missing title) */
const shownTitle = (n: Note) => n.title.trim() || n.text.trim().split('\n')[0] || 'Untitled';
/** the description without the first line when that line is standing in for a missing title */
const bodyOf = (n: Note) => (n.title.trim() ? n.text : n.text.split('\n').slice(1).join('\n')).trim();

export interface DragBits { setNodeRef: Ref<HTMLLIElement>; style: CSSProperties; dragging: boolean; rowProps: HTMLAttributes<HTMLElement>; handleProps: HTMLAttributes<HTMLElement> }

export interface ItemRowProps {
  n: Note; variant: 'row' | 'card'; active?: boolean; finishing?: boolean; drag?: DragBits; /** no checkbox (the bin) */ hideCheck?: boolean;
  onOpen: () => void; onToggleDone: () => void; onMenu: (x: number, y: number) => void; onSendToTags: () => void;
  onProgress: (v: number) => void; onDue: (iso: string | null) => void;
}

/**
 * One item. Collapsed it is: a checkbox (only when the item is on the task list), the whole title (any number of lines), the first line of the description, and under them its date and its tags in their own colours.
 * The arrow opens it in place: the description, the progress slider, the date and the big buttons, without leaving the list. A right click, a long
 * press or the "more" button opens the menu; the grip (or the whole row, with a mouse) drags it to a new place.
 */
export function ItemRow({ n, variant, active, finishing, drag, hideCheck, onOpen, onToggleDone, onMenu, onSendToTags, onProgress, onDue }: ItemRowProps) {
  const [open, setOpen] = useState(false);
  const allTags = useStore((s) => s.tags);
  const { colors } = looksOf(allTags, n.tags);
  const hold = useLongPress(onMenu);
  const body = bodyOf(n), markdown = n.noteType === 'markdown';
  const preview = firstLine(body, markdown);
  const html = useMemo(() => (open && markdown ? renderMarkdown(body) : ''), [open, markdown, body]);
  const done = n.archived;
  const card = variant === 'card';
  return (
    <li ref={drag?.setNodeRef} style={drag?.style} data-finishing={finishing || undefined} data-done={done || undefined} data-dragging={drag?.dragging || undefined} className={cn('tk-item list-none', card && 'min-w-0')}>
      <div className={cn('card bt-row tk-card relative select-none overflow-hidden transition-shadow', active && 'border-accent ring-1 ring-accent', drag?.dragging && 'shadow-2xl ring-1 ring-accent')}
        {...hold} {...drag?.rowProps} onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}>
        <span aria-hidden className="tk-wash pointer-events-none absolute inset-0" style={wash(colors)} />
        <span aria-hidden className="tk-stripe pointer-events-none absolute inset-y-0 left-0 w-1.5" style={stripe(colors)} />
        <div className="relative flex items-start gap-0.5 py-1 pl-2.5 pr-1">
          {drag && <button type="button" className="tk-grip mt-1 grid h-9 w-7 shrink-0 cursor-grab place-items-center rounded text-muted hover:text-fg active:cursor-grabbing" aria-label={`Move ${titleOf(n)}: press space, then the arrow keys`} {...drag.handleProps}><GripVertical size={16} /></button>}
          {n.onList && !hideCheck && (
            <label className="tk-check grid h-10 w-10 shrink-0 cursor-pointer place-items-center" data-nohold>
              <input type="checkbox" className="h-5 w-5 cursor-pointer" checked={done || !!finishing} disabled={!!finishing} onChange={onToggleDone} aria-label={`${done ? 'Reopen' : 'Finish'}: ${titleOf(n)}`} />
            </label>)}
          <button type="button" className={cn('min-w-0 flex-1 py-2 text-left', (!n.onList || hideCheck) && 'pl-1.5')} onClick={onOpen} aria-current={active ? 'true' : undefined}>
            <span className="flex items-start gap-1.5">
              <span className={cn('tk-title min-w-0 flex-1 whitespace-pre-line break-words text-[0.95rem] font-semibold', done && 'task-done')}>{shownTitle(n)}</span>
              {n.pinned && <Pin size={13} className="mt-1 shrink-0 text-accent" aria-label="Pinned" />}
            </span>
            {preview && <span className="mt-0.5 block truncate text-[13px] text-muted">{preview}</span>}
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              {n.dueDate && <span className={cn('inline-flex items-center gap-1', isOverdue(n.dueDate, done) && 'font-semibold text-bad')} title="Due"><Calendar size={11} />{fmtDay(n.dueDate)}</span>}
              <span className="inline-flex items-center gap-1" title={`Made ${new Date(n.createdAt).toLocaleString()}`}><Clock size={11} />{fmtShort(n.createdAt)}</span>
              {n.onList && n.percentDone > 0 && <span>{Math.round(n.percentDone * 100)}%</span>}
              {n.tags.slice(0, card ? 6 : 3).map((x) => <TagChip key={x} title={x} short />)}
              {n.tags.length > (card ? 6 : 3) && <span>+{n.tags.length - (card ? 6 : 3)}</span>}
            </span>
          </button>
          <button type="button" data-nohold className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Hide the description' : 'Show the description'} title={open ? 'Hide' : 'Show the description'}>
            <ChevronRight size={18} className={cn('transition-transform', open && 'rotate-90')} />
          </button>
          <button type="button" data-nohold className="grid h-10 w-9 shrink-0 place-items-center rounded text-muted hover:text-fg" aria-haspopup="menu" aria-label={`More for ${titleOf(n)}`} title="More" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu(r.right - 240 > 8 ? r.right - 240 : r.left, r.bottom + 4); }}>
            <MoreHorizontal size={18} />
          </button>
        </div>
        {open && (
          <div className="relative space-y-3 border-t border-line/60 px-4 pb-3 pt-3 select-text" data-nohold>
            {body
              ? markdown
                ? <div className="guide max-h-80 cursor-pointer overflow-hidden text-sm" title="Open it" aria-label="Description (Markdown)" dangerouslySetInnerHTML={{ __html: html }} onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) onOpen(); }} />
                : <button type="button" className="block w-full text-left text-sm" onClick={onOpen} title="Open it"><span className="line-clamp-[12] whitespace-pre-line break-words text-muted">{body}{n.text.length >= 400 ? '…' : ''}</span></button>
              : <p className="text-sm text-muted">No description. <button type="button" className="underline" onClick={onOpen}>Open it to add one.</button></p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {n.onList && !hideCheck && <label className="flex min-w-[11rem] flex-1 items-center gap-2 text-xs text-muted">Progress
                <input type="range" className="bt-range bt-hit min-w-0 flex-1" aria-label={`Progress: ${Math.round(n.percentDone * 100)}%`} min={0} max={100} step={5} value={Math.round(n.percentDone * 100)} style={{ '--p': `${Math.round(n.percentDone * 100)}%` } as CSSProperties}
                  onChange={(e) => onProgress(Number(e.target.value) / 100)} /><span className="w-9 text-right tabular-nums">{Math.round(n.percentDone * 100)}%</span></label>}
              <label className="flex items-center gap-2 text-xs text-muted">Due
                <input type="date" className="input !w-auto !py-1 text-sm" value={toLocalInput(n.dueDate).slice(0, 10)} onChange={(e) => onDue(e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null)} /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={onOpen}>Open</button>
              <button type="button" className="btn" onClick={onSendToTags}><Tags size={15} />{n.tags.length ? 'Change tags' : 'Send to tags'}</button>
            </div>
          </div>)}
      </div>
    </li>
  );
}
