import { useEffect, useMemo, useRef, useState, type MouseEvent, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
import { Calendar, GripVertical, ListChecks, MoreHorizontal, Pencil, Pin, Tags } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { fmtDay, fmtShort, isOverdue, toLocalInput } from '../lib/dates.ts';
import { firstLine, renderMarkdown } from '../lib/markdown.ts';
import type { Note } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { looksOf, stripe, wash } from '../lib/tagLook.ts';
import { useLongPress } from '../lib/useLongPress.ts';
import { takeFresh } from '../lib/fresh.ts';
import { TagChip } from './TagChip.tsx';

/** a short name for labels, menus and toasts */
export const titleOf = (n: Note) => (n.autoTitle ? '' : n.title.trim()).split('\n')[0]?.slice(0, 80) || n.text.trim().split('\n')[0]?.slice(0, 80) || 'Untitled';
/** The title you wrote (empty when there is none, or when it is only the date the app put there): such an item is shown by its text instead. */
export const writtenTitle = (n: Note) => (n.autoTitle ? '' : n.title.trim());
/** is there more description after the line shown as the preview? (then the preview is followed by a gap and an ellipsis on its own line) */
const hasMore = (body: string) => body.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim()).length > 1;

export interface DragBits { setNodeRef: Ref<HTMLLIElement>; style: CSSProperties; dragging: boolean; rowProps: HTMLAttributes<HTMLElement>; handleProps: HTMLAttributes<HTMLElement> }

export interface ItemRowProps {
  n: Note; variant: 'row' | 'card'; active?: boolean; finishing?: boolean; drag?: DragBits; /** no checkbox (the bin) */ hideCheck?: boolean;
  onOpen: () => void; onToggleDone: () => void; onMenu: (x: number, y: number) => void; onSendToTags: () => void; onSendToTasks: () => void; onChangeTags: () => void;
  onProgress: (v: number) => void; onDue: (iso: string | null) => void;
}

/**
 * One item. Tap anywhere on it (not the checkbox, the grip or the buttons) to read it in place; double-click (or tap the pencil) to edit it. Opened up, the small
 * preview goes away and the date, due date and tags move to the bottom, under the rest of the description, the controls and the "send to" button. Only a task has a
 * due date and progress. An item with no title of its own (or only the date the app put there) is shown by its text. A right click, a long press or the dots open the
 * menu; the grip (or the whole row, with a mouse) drags it to a new place.
 */
export function ItemRow({ n, variant, active, finishing, drag, hideCheck, onOpen, onToggleDone, onMenu, onSendToTags, onSendToTasks, onChangeTags, onProgress, onDue }: ItemRowProps) {
  const [open, setOpen] = useState(false);
  // A click waits a moment to see whether it is the first half of a double click (which edits); while it waits the card shows a soft ring, then the item opens up.
  const [arming, setArming] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const click = (e: MouseEvent) => {
    window.clearTimeout(timer.current);
    if (e.detail >= 2) { setArming(false); onOpen(); return; }
    if (e.detail === 0) { setOpen((o) => !o); return; } // the keyboard: no waiting
    setArming(true);
    timer.current = window.setTimeout(() => { setArming(false); setOpen((o) => !o); }, 230);
  };
  const [fresh] = useState(() => takeFresh(n.id));
  const allTags = useStore((s) => s.tags);
  const { colors, bars } = looksOf(allTags, n.tags);
  const hold = useLongPress(onMenu);
  const markdown = n.noteType === 'markdown';
  const own = writtenTitle(n);            // the title you wrote, if any
  const text = n.text.trim();
  const body = own ? text : '';           // the part shown below the title
  const textLines = text.replace(/\r\n?/g, '\n').split('\n');
  const preview = own ? firstLine(text, markdown) : '', more = own && (hasMore(text) || n.text.length >= 400);
  const html = useMemo(() => (open && markdown ? renderMarkdown(text) : ''), [open, markdown, text]);
  const done = n.archived;
  const card = variant === 'card';
  const task = n.onList;
  const shortTags = card ? 6 : 3;
  const meta = (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      {task && n.dueDate && <span className={cn('inline-flex items-center gap-1', isOverdue(n.dueDate, done) && 'font-semibold text-bad')} title="Due"><Calendar size={11} />{fmtDay(n.dueDate)}</span>}
      <span title={`Made ${new Date(n.createdAt).toLocaleString()}`}>{fmtShort(n.createdAt)}</span>
      {task && n.percentDone > 0 && <span>{Math.round(n.percentDone * 100)}%</span>}
      {n.tags.slice(0, open ? 12 : shortTags).map((x) => <TagChip key={x} title={x} short />)}
      {!open && n.tags.length > shortTags && <span>+{n.tags.length - shortTags}</span>}
    </span>);
  return (
    <li ref={drag?.setNodeRef} style={drag?.style} data-finishing={finishing || undefined} data-done={done || undefined} data-dragging={drag?.dragging || undefined} data-new={fresh || undefined} data-arming={arming || undefined} className={cn('tk-item list-none', card && 'min-w-0')}>
      <div className={cn('card bt-row tk-card relative select-none overflow-hidden transition-shadow', active && 'border-accent ring-1 ring-accent', drag?.dragging && 'shadow-2xl ring-1 ring-accent')}
        {...hold} {...drag?.rowProps} onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}>
        <span aria-hidden className="tk-wash pointer-events-none absolute inset-0" style={wash(colors)} />
        <span aria-hidden className="tk-stripe pointer-events-none absolute inset-y-0 left-0 w-1.5" style={stripe(bars)} />
        <div className="relative flex items-start gap-0.5 py-1 pl-2.5 pr-1">
          {drag && <button type="button" className="tk-grip mt-1 grid h-9 w-7 shrink-0 cursor-grab place-items-center rounded text-muted hover:text-fg active:cursor-grabbing" aria-label={`Move ${titleOf(n)}: press space, then the arrow keys`} {...drag.handleProps}><GripVertical size={16} /></button>}
          {task && !hideCheck && (
            <label className="tk-check grid h-[var(--tk-btn,2.75rem)] w-[var(--tk-btn,2.75rem)] shrink-0 cursor-pointer place-items-center" data-nohold>
              <input type="checkbox" className="h-[calc(var(--tk-btn,2.75rem)*0.46)] w-[calc(var(--tk-btn,2.75rem)*0.46)] cursor-pointer" checked={done || !!finishing} disabled={!!finishing} onChange={onToggleDone} aria-label={`${done ? 'Unarchive' : 'Archive'}: ${titleOf(n)}`} />
            </label>)}
          <button type="button" className={cn('min-w-0 flex-1 cursor-pointer py-2 text-left', (!task || hideCheck) && 'pl-1.5')} onClick={click} aria-expanded={open} aria-current={active ? 'true' : undefined}>
            <span className="flex items-start gap-1.5">
              {own
                ? <span className={cn('tk-title min-w-0 flex-1 whitespace-pre-line break-words text-[0.95rem] font-semibold', done && 'task-done')}>{own}</span>
                : open && markdown && text
                  ? <span className={cn('tk-title guide min-w-0 flex-1 text-[0.95rem]', done && 'task-done')} dangerouslySetInnerHTML={{ __html: html }} />
                  : <span className={cn('tk-title min-w-0 flex-1 whitespace-pre-line break-words text-[0.95rem] font-semibold', !open && 'line-clamp-3', done && 'task-done')}>{text ? (open ? text : textLines.slice(0, 3).map((l) => (markdown ? firstLine(l, true) : l)).join('\n')) : 'Untitled'}</span>}
            </span>
            {!open && !own && text && (textLines.length > 3 || n.text.length >= 400) && <span aria-label="More text" className="block whitespace-pre text-[13px] leading-none text-muted">{'     …'}</span>}
            {!open && preview && <span className="mt-0.5 block truncate text-[13px] text-muted">{preview}</span>}
            {!open && preview && more && <span aria-label="More text" className="block whitespace-pre text-[13px] leading-none text-muted">{'     …'}</span>}
            {!open && meta}
          </button>
          <div className="relative h-[var(--tk-btn,2.75rem)] min-h-[3.25rem] w-[5.25rem] shrink-0 self-stretch" data-nohold>
            {n.pinned && <Pin size={13} className="absolute right-[0.4rem] top-[2.1rem] text-accent" aria-label="Pinned" />}
            <button type="button" tabIndex={active ? -1 : 0} aria-hidden={active || undefined} className={cn('absolute left-0 top-1/2 grid h-[var(--tk-btn,2.75rem)] w-[var(--tk-btn,2.75rem)] -translate-y-1/2 place-items-center rounded-full border border-line bg-raised/60 text-fg transition-opacity hover:border-accent hover:text-accent', active && 'pointer-events-none opacity-0')} onClick={onOpen} aria-label={`Edit ${titleOf(n)}`} title="Edit (or double-click the item)"><Pencil size={19} /></button>
            <button type="button" tabIndex={active ? -1 : 0} aria-hidden={active || undefined} className={cn('absolute right-0 top-0.5 grid h-7 w-7 place-items-center rounded text-muted transition-opacity hover:text-fg', active && 'pointer-events-none opacity-0')} aria-haspopup="menu" aria-label={`More for ${titleOf(n)}`} title="More" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu(r.right - 240 > 8 ? r.right - 240 : r.left, r.bottom + 4); }}>
              <MoreHorizontal size={17} />
            </button>
          </div>
        </div>
        {open && (
          <div className="tk-expand relative space-y-3 border-t border-line/60 px-4 pb-3 pt-3 select-text" data-nohold>
            {own && (body
              ? markdown
                ? <div className="guide max-h-80 overflow-hidden text-sm" aria-label="Description (Markdown)" dangerouslySetInnerHTML={{ __html: html }} />
                : <span className="block whitespace-pre-line break-words text-sm text-muted">{body}{n.text.length >= 400 ? '…' : ''}</span>
              : <p className="text-sm text-muted">No description. <button type="button" className="underline" onClick={onOpen}>Open it to add one.</button></p>)}
            {task && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {!hideCheck && <label className="flex min-w-[11rem] flex-1 items-center gap-2 text-xs text-muted">Progress
                  <input type="range" className="bt-range bt-hit min-w-0 flex-1" aria-label={`Progress: ${Math.round(n.percentDone * 100)}%`} min={0} max={100} step={5} value={Math.round(n.percentDone * 100)} style={{ '--p': `${Math.round(n.percentDone * 100)}%` } as CSSProperties}
                    onChange={(e) => onProgress(Number(e.target.value) / 100)} /><span className="w-9 text-right tabular-nums">{Math.round(n.percentDone * 100)}%</span></label>}
                <label className="flex items-center gap-2 text-xs text-muted">Due
                  <input type="date" className="input !w-auto !py-1 text-sm" value={toLocalInput(n.dueDate).slice(0, 10)} onChange={(e) => onDue(e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null)} /></label>
              </div>)}
            {!hideCheck && <div className="flex flex-wrap gap-2">
              {task
                ? <button type="button" className="btn" onClick={onSendToTags}><Tags size={15} />Send to tags</button>
                : <><button type="button" className="btn" onClick={onSendToTasks}><ListChecks size={15} />Send to tasks</button><button type="button" className="btn" onClick={onChangeTags}><Tags size={15} />{n.tags.length ? 'Change tags' : 'Add tags'}</button></>}
            </div>}
            {meta}
          </div>)}
      </div>
    </li>
  );
}
