import { Calendar, Flag, Pin, Repeat, Star } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { fmtDay, isOverdue } from '../lib/dates.ts';
import type { Note } from '../lib/api.ts';

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
      {n.tags.slice(0, max).map((x) => <span key={x} className="chip">{x}</span>)}
      {n.tags.length > max && <span>+{n.tags.length - max}</span>}
    </div>
  );
}

/** One line of the list: a checkbox when the note is a task, the title, a preview, chips. */
export function NoteRow({ n, active, onOpen, onToggle }: { n: Note; active: boolean; onOpen: () => void; onToggle: () => void }) {
  const t = n.task;
  return (
    <li>
      <div className={cn('card bt-row flex items-start gap-2.5 px-3 py-2 hover:border-accent', active && 'border-accent ring-1 ring-accent')}>
        {t && <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 cursor-pointer" checked={t.done} onChange={onToggle} aria-label={`${t.done ? 'Reopen' : 'Complete'}: ${titleOf(n)}`} />}
        <button className="min-w-0 flex-1 text-left" onClick={onOpen} aria-current={active ? 'true' : undefined}>
          <div className="flex items-center gap-1.5"><span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', t?.done && 'task-done')}>{titleOf(n)}</span>{t?.isFavorite && <Star size={12} className="shrink-0 fill-current text-warn" aria-label="Starred" />}{n.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}</div>
          {preview(n) && <div className="line-clamp-2 whitespace-pre-line break-words text-xs text-muted">{preview(n).slice(0, 200)}</div>}
          <div className="mt-1"><Chips n={n} /></div>
        </button>
      </div>
    </li>
  );
}

/** A card on the Keep wall. */
export function KeepCard({ n, onOpen, onToggle }: { n: Note; onOpen: () => void; onToggle: () => void }) {
  const t = n.task;
  return (
    <li className="mb-3 break-inside-avoid">
      <div className="card bt-row hover:border-accent">
        <button className="block w-full space-y-1.5 p-3 text-left" onClick={onOpen}>
          <div className="flex items-start gap-2">
            {t && <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer" checked={t.done} onClick={(e) => e.stopPropagation()} onChange={onToggle} aria-label={`${t.done ? 'Reopen' : 'Complete'}: ${titleOf(n)}`} />}
            <span className={cn('min-w-0 flex-1 break-words text-sm font-semibold', t?.done && 'task-done')}>{titleOf(n)}</span>{n.pinned && <Pin size={12} className="mt-1 shrink-0 text-accent" aria-label="Pinned" />}
          </div>
          {preview(n) && <div className="line-clamp-[10] whitespace-pre-line break-words text-sm text-muted">{preview(n)}</div>}
          <Chips n={n} />
        </button>
      </div>
    </li>
  );
}
