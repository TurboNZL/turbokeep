import { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Flag, Pin, Repeat, Star } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { fmtDay, isOverdue } from '../lib/dates.ts';
import { api, type Note, type NoteDetail } from '../lib/api.ts';
import { TagChip } from './TagChip.tsx';

export const titleOf = (n: Note) => n.title.trim() || n.text.trim().split('\n')[0]?.slice(0, 80) || 'Untitled';
const preview = (n: Note) => (n.title.trim() ? n.text : n.text.split('\n').slice(1).join('\n')).trim();

/** The chips of a task (due date, priority, repeat) and the note's tags: shared by the list rows and the Keep cards. */
export function Chips({ n, max = 3 }: { n: Note; max?: number }) {
  const t = n.task;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      {t?.dueDate && <span className={cn('inline-flex items-center gap-1', isOverdue(t.dueDate, t.done) && 'font-medium text-bad')}><Calendar size={11} />{fmtDay(t.dueDate)}</span>}
      {t && (t.repeatAfter > 0 || t.repeatMode === 1) && <Repeat size={11} aria-label="Repeats" />}
      {t && t.priority >= 3 && <span className={cn('inline-flex items-center gap-0.5', t.priority >= 4 ? 'text-bad' : 'text-warn')}><Flag size={11} />P{t.priority}</span>}
      {n.tags.slice(0, max).map((x) => <TagChip key={x} title={x} />)}
      {n.tags.length > max && <span>+{n.tags.length - max}</span>}
    </div>
  );
}

/**
 * What a task shows when its row is opened with the arrow: the rest of its text, its dates, and its sub-tasks as checkboxes of their own.
 * It asks the server for the whole note only now, so a long list costs nothing until you look.
 */
function Expanded({ n, onChanged }: { n: Note; onChanged: () => void }) {
  const [d, setD] = useState<NoteDetail | null>(null);
  useEffect(() => { let alive = true; api.noteOrNull(n.id).then((x) => alive && setD(x)); return () => { alive = false; }; }, [n.id, n.updatedAt, n.task?.done]);
  if (!d) return <p className="px-1 py-2 text-xs text-muted">Loading…</p>;
  const t = d.task!;
  const subs = t.related.subtask ?? [];
  const toggleSub = async (s: { noteId: string; done: boolean }) => { await api.patchTask(s.noteId, { done: !s.done }); onChanged(); };
  return (
    <div className="space-y-2 pb-1 pl-7 pr-1 text-sm">
      {d.text.trim() && <div className="line-clamp-6 whitespace-pre-line break-words text-muted">{d.text.trim()}</div>}
      {subs.length > 0 && <ul className="space-y-1">{subs.map((s) => (
        <li key={s.id} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 cursor-pointer" checked={s.done} onChange={() => void toggleSub(s)} aria-label={`${s.done ? 'Reopen' : 'Complete'}: ${s.title}`} /><span className={cn(s.done && 'task-done')}>{s.title}</span></li>))}</ul>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {t.dueDate && <span>Due {fmtDay(t.dueDate)}</span>}{t.startDate && <span>Starts {fmtDay(t.startDate)}</span>}
        {t.reminders.length > 0 && <span>{t.reminders.length} reminder{t.reminders.length === 1 ? '' : 's'}</span>}
        {t.commentCount > 0 && <span>{t.commentCount} comment{t.commentCount === 1 ? '' : 's'}</span>}
        {!d.text.trim() && !subs.length && !t.dueDate && !t.reminders.length && !t.commentCount && <span>Nothing more yet. Open it to add details.</span>}
      </div>
    </div>
  );
}

/** One line of the list. A task has a checkbox and an arrow that opens it in place; a plain note shows its first lines. */
export function NoteRow({ n, active, onOpen, onToggle, onChanged }: { n: Note; active: boolean; onOpen: () => void; onToggle: () => void; onChanged: () => void }) {
  const t = n.task;
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div className={cn('card bt-row px-3 py-2 hover:border-accent', active && 'border-accent ring-1 ring-accent')}>
        <div className="flex items-start gap-2.5">
          {t && <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 cursor-pointer" checked={t.done} onChange={onToggle} aria-label={`${t.done ? 'Reopen' : 'Complete'}: ${titleOf(n)}`} />}
          <button className="min-w-0 flex-1 text-left" onClick={onOpen} aria-current={active ? 'true' : undefined}>
            <div className="flex items-center gap-1.5"><span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', t?.done && 'task-done')}>{titleOf(n)}</span>{t?.isFavorite && <Star size={12} className="shrink-0 fill-current text-warn" aria-label="Starred" />}{n.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}</div>
            {!t && preview(n) && <div className="line-clamp-2 whitespace-pre-line break-words text-xs text-muted">{preview(n).slice(0, 200)}</div>}
            <div className="mt-1"><Chips n={n} /></div>
          </button>
          {t && <button className="-mr-1 mt-0.5 rounded p-1 text-muted hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Show less' : 'Show more'} title={open ? 'Show less' : 'Show more'}><ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} /></button>}
        </div>
        {t && open && <Expanded n={n} onChanged={onChanged} />}
      </div>
    </li>
  );
}

/** A card on the Keep wall. A task card has its checkbox and the same arrow. */
export function KeepCard({ n, onOpen, onToggle, onChanged }: { n: Note; onOpen: () => void; onToggle: () => void; onChanged: () => void }) {
  const t = n.task;
  const [open, setOpen] = useState(false);
  return (
    <li className="mb-3 break-inside-avoid">
      <div className="card bt-row hover:border-accent">
        <div className="flex items-start gap-2 p-3 pb-0">
          {t && <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer" checked={t.done} onChange={onToggle} aria-label={`${t.done ? 'Reopen' : 'Complete'}: ${titleOf(n)}`} />}
          <button className="min-w-0 flex-1 break-words text-left" onClick={onOpen}><span className={cn('text-sm font-semibold', t?.done && 'task-done')}>{titleOf(n)}</span></button>
          {n.pinned && <Pin size={12} className="mt-1 shrink-0 text-accent" aria-label="Pinned" />}
          {t && <button className="-mr-1 rounded p-0.5 text-muted hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Show less' : 'Show more'}><ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} /></button>}
        </div>
        <div className="space-y-1.5 p-3 pt-1.5">
          {!t && preview(n) && <button className="block w-full text-left" onClick={onOpen}><div className="line-clamp-[10] whitespace-pre-line break-words text-sm text-muted">{preview(n)}</div></button>}
          {t && open && <Expanded n={n} onChanged={onChanged} />}
          <Chips n={n} />
        </div>
      </div>
    </li>
  );
}
