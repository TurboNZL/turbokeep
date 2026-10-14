import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, Plus, Star, Undo2, X } from 'lucide-react';
import { api, type NoteDetail, type Reminder, type Task } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { fromLocalInput, toLocalInput } from '../lib/dates.ts';
import { cn } from '../lib/cn.ts';
import { Select } from './Select.tsx';

const PRIORITY = ['Not set', 'Low', 'Medium', 'High', 'Urgent', 'Do now'].map((label, i) => ({ value: String(i), label }));
const KINDS: [string, string][] = [['subtask', 'Subtask'], ['parenttask', 'Parent task'], ['related', 'Related'], ['blocking', 'Blocks'], ['blocked', 'Blocked by'], ['precedes', 'Precedes'], ['follows', 'Follows'], ['duplicateof', 'Duplicate of'], ['duplicates', 'Duplicated by'], ['copiedfrom', 'Copied from'], ['copiedto', 'Copied to']];
const UNITS = [{ value: '3600', label: 'hours' }, { value: '86400', label: 'days' }, { value: '604800', label: 'weeks' }];
const MODES = [{ value: '0', label: 'Every … from the due date' }, { value: '2', label: 'Every … from when I finish it' }, { value: '1', label: 'Every month' }];
const REL_TO: Record<string, string> = { due_date: 'due date', start_date: 'start date', end_date: 'end date' };

const relText = (r: Reminder) => {
  const s = Math.abs(r.relativePeriod), n = s % 86400 === 0 ? [s / 86400, 'day'] : s % 3600 === 0 ? [s / 3600, 'hour'] : [Math.round(s / 60), 'minute'];
  return `${r.relativePeriod === 0 ? 'At' : `${n[0]} ${n[1]}${n[0] === 1 ? '' : 's'} ${r.relativePeriod < 0 ? 'before' : 'after'}`} the ${REL_TO[r.relativeTo] ?? r.relativeTo}`;
};

/**
 * The task side of a note: done, dates, priority, project, repeat, reminders, related tasks and comments. Every change is saved at once
 * (the note's own text autosaves in the editor), so there is no Save button to forget.
 */
export function TaskPanel({ note, task, onTask, onOpenNote }: { note: NoteDetail; task: Task; onTask: (t: Task | null) => void; onOpenNote: (noteId: string) => void }) {
  const projects = useStore((s) => s.projects);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(task.percentDone);
  const [repeatEvery, setRepeatEvery] = useState('');
  const [comment, setComment] = useState('');
  const [relKind, setRelKind] = useState('related');
  const [relQ, setRelQ] = useState('');
  const [relHits, setRelHits] = useState<Task[]>([]);
  const timer = useRef<number>();

  const unit = [604800, 86400, 3600].find((s) => task.repeatAfter > 0 && task.repeatAfter % s === 0) ?? 86400;
  const [repeatUnit, setRepeatUnit] = useState(String(unit));
  useEffect(() => { setProgress(task.percentDone); setRepeatEvery(task.repeatAfter ? String(task.repeatAfter / unit) : ''); setRepeatUnit(String(unit)); }, [task.id, task.percentDone, task.repeatAfter, unit]);
  useEffect(() => {
    if (relQ.trim().length < 2) { setRelHits([]); return; }
    const h = setTimeout(() => api.tasks({ q: relQ }).then((r) => setRelHits(r.filter((x) => x.id !== task.id).slice(0, 8)), () => {}), 200);
    return () => clearTimeout(h);
  }, [relQ, task.id]);

  const patch = async (body: Record<string, unknown>) => {
    setError(null);
    try { onTask(await api.patchTask(note.id, body)); void refreshMeta(); } catch (e) { setError((e as Error).message); }
  };
  const act = async (p: Promise<Task>) => { try { onTask(await p); setError(null); } catch (e) { setError((e as Error).message); } };
  const slowPatch = (body: Record<string, unknown>) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void patch(body), 400); };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const repeatSeconds = (every: string, u: string) => Math.round(Number(every || 0) * Number(u));
  const withDefault = (date: string | null) => date || new Date(Date.now() + 86400000).toISOString();

  return (
    <section className="card bt-panel space-y-3 p-3" aria-label="Task">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={task.done} onChange={() => void patch({ done: !task.done })} />{task.done ? 'Done' : 'Task'}</label>
        {task.dueDate && <span className="chip text-xs">{new Date(task.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost !px-2" aria-pressed={task.isFavorite} title={task.isFavorite ? 'Unstar' : 'Star'} onClick={() => void patch({ isFavorite: !task.isFavorite })}><Star size={16} className={task.isFavorite ? 'fill-current text-warn' : ''} /></button>
          <button className="btn btn-ghost !px-2 text-xs" title="Keep the note, drop the task" onClick={async () => { if (confirm('Take the task off this note? The note stays; the dates, reminders, relations and comments of the task are removed.')) { await api.detachTask(note.id); onTask(null); void refreshMeta(); } }}><Undo2 size={14} />Not a task</button>
          <button className="btn btn-ghost !px-2" aria-expanded={open} aria-label={open ? 'Hide task details' : 'Show task details'} onClick={() => setOpen(!open)}><ChevronDown size={16} className={cn('transition-transform', !open && '-rotate-90')} /></button>
        </div>
      </div>

      {open && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block space-y-1 text-sm">Project<Select value={String(task.projectId)} onChange={(v) => void patch({ projectId: Number(v) })} options={projects.map((p) => ({ value: String(p.id), label: p.isInbox ? 'No list' : p.title }))} /></label>
          <label className="block space-y-1 text-sm">Priority<Select value={String(task.priority)} onChange={(v) => void patch({ priority: Number(v) })} options={PRIORITY} /></label>
          <label className="block space-y-1 text-sm">Progress: {Math.round(progress * 100)}%<input type="range" className="bt-range bt-hit w-full" style={{ '--p': `${progress * 100}%` } as React.CSSProperties} min={0} max={100} step={10} value={Math.round(progress * 100)} onChange={(e) => { setProgress(Number(e.target.value) / 100); slowPatch({ percentDone: Number(e.target.value) / 100 }); }} /></label>
          <label className="block space-y-1 text-sm">Due<input className="input" type="datetime-local" value={toLocalInput(task.dueDate)} onChange={(e) => void patch({ dueDate: fromLocalInput(e.target.value) })} /></label>
          <label className="block space-y-1 text-sm">Start<input className="input" type="datetime-local" value={toLocalInput(task.startDate)} onChange={(e) => void patch({ startDate: fromLocalInput(e.target.value) })} /></label>
          <label className="block space-y-1 text-sm">End<input className="input" type="datetime-local" value={toLocalInput(task.endDate)} onChange={(e) => void patch({ endDate: fromLocalInput(e.target.value) })} /></label>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm">Reminders</div>
          {task.reminders.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              {r.reminder && !r.relativeTo ? <input className="input" type="datetime-local" aria-label="Reminder time" value={toLocalInput(r.reminder)} onChange={(e) => void patch({ reminders: task.reminders.map((x, j) => (j === i ? { ...x, reminder: fromLocalInput(e.target.value) } : x)) })} /> : <span className="flex-1 text-sm text-muted">{relText(r)}</span>}
              <button type="button" className="btn btn-ghost !px-2" aria-label="Remove reminder" onClick={() => void patch({ reminders: task.reminders.filter((_, j) => j !== i) })}><X size={15} /></button>
            </div>))}
          <button type="button" className="btn text-sm" onClick={() => void patch({ reminders: [...task.reminders, { reminder: withDefault(task.dueDate), relativePeriod: 0, relativeTo: '' }] })}><Plus size={15} />Add reminder</button>
          <p className="text-xs text-muted">Reminders are stored and exported; the server does not send notifications.</p>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm">Repeat</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="!w-auto min-w-[14rem]" aria-label="Repeat mode" value={String(task.repeatMode)} onChange={(v) => void patch({ repeatMode: Number(v), ...(v === '1' ? { repeatAfter: 0 } : {}) })} options={MODES} />
            {task.repeatMode !== 1 && <>
              <input className="input !w-20" type="number" min={0} aria-label="Repeat every" value={repeatEvery} onChange={(e) => setRepeatEvery(e.target.value)} onBlur={() => void patch({ repeatAfter: repeatSeconds(repeatEvery, repeatUnit) })} />
              <Select className="!w-auto" aria-label="Unit" value={repeatUnit} onChange={(v) => { setRepeatUnit(v); void patch({ repeatAfter: repeatSeconds(repeatEvery, v) }); }} options={UNITS} /></>}
          </div>
          <p className="text-xs text-muted">0 = does not repeat. Completing a repeating task keeps it open and moves its dates on.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium"><Link2 size={15} />Related tasks</div>
          {Object.entries(task.related).map(([kind, list]) => (
            <div key={kind} className="text-sm"><span className="text-muted">{KINDS.find((k) => k[0] === kind)?.[1] ?? kind}: </span>
              {list.map((r) => <span key={r.id} className="mr-2 inline-flex items-center gap-1"><button className="underline decoration-dotted underline-offset-2" onClick={() => onOpenNote(r.noteId)}>{r.title || 'Untitled'}</button><button aria-label={`Remove relation to ${r.title}`} className="text-muted hover:text-bad" onClick={() => void act(api.removeRelation(task.id, r.id, kind))}><X size={12} /></button></span>)}</div>))}
          <div className="flex flex-wrap items-start gap-2">
            <Select className="!w-auto min-w-[9rem]" aria-label="Relation kind" value={relKind} onChange={setRelKind} options={KINDS.map(([value, label]) => ({ value, label }))} />
            <div className="relative min-w-[12rem] flex-1">
              <input className="input" aria-label="Find a task to relate" placeholder="Find a task…" value={relQ} onChange={(e) => setRelQ(e.target.value)} />
              {relHits.length > 0 && <ul className="bt-menu absolute left-0 right-0 z-10 mt-1 overflow-hidden py-1">{relHits.map((h) => <li key={h.id}><button className="block w-full truncate px-3 py-1.5 text-left text-sm" onClick={() => { setRelQ(''); void act(api.addRelation(task.id, h.id, relKind)); }}>{h.title || 'Untitled'}</button></li>)}</ul>}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Comments</div>
          {task.comments.map((c) => (
            <div key={c.id} className="rounded-theme bg-raised/50 p-2.5 text-sm"><div className="mb-0.5 flex items-center gap-2 text-xs text-muted"><span>{c.author || 'someone'} · {new Date(c.createdAt).toLocaleString()}</span><button className="ml-auto hover:text-bad" aria-label="Delete comment" onClick={() => void act(api.deleteComment(task.id, c.id))}><X size={12} /></button></div><div className="whitespace-pre-line break-words">{c.comment}</div></div>))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { const c = comment; setComment(''); void act(api.addComment(task.id, c)); } }}>
            <input className="input" aria-label="New comment" placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn" disabled={!comment.trim()}>Post</button></form>
        </div>
      </>}
      {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
    </section>
  );
}
