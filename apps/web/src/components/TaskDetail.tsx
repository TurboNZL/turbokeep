import { useEffect, useState } from 'react';
import { Link2, Plus, Star, Trash2, X } from 'lucide-react';
import { api, type Reminder, type Task } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { fromLocalInput, toLocalInput } from '../lib/dates.ts';
import { Dialog } from './Dialog.tsx';

const PRIORITY = ['Not set', 'Low', 'Medium', 'High', 'Urgent', 'Do now'];
const KINDS: [string, string][] = [['subtask', 'Subtask'], ['parenttask', 'Parent task'], ['related', 'Related'], ['blocking', 'Blocks'], ['blocked', 'Blocked by'], ['precedes', 'Precedes'], ['follows', 'Follows'], ['duplicateof', 'Duplicate of'], ['duplicates', 'Duplicated by'], ['copiedfrom', 'Copied from'], ['copiedto', 'Copied to']];
const UNITS = [['hours', 3600], ['days', 86400], ['weeks', 604800]] as const;
const REL_TO: Record<string, string> = { due_date: 'due date', start_date: 'start date', end_date: 'end date' };

const relText = (r: Reminder) => {
  const s = Math.abs(r.relativePeriod), n = s % 86400 === 0 ? [s / 86400, 'day'] : s % 3600 === 0 ? [s / 3600, 'hour'] : [Math.round(s / 60), 'minute'];
  return `${r.relativePeriod === 0 ? 'At' : `${n[0]} ${n[1]}${n[0] === 1 ? '' : 's'} ${r.relativePeriod < 0 ? 'before' : 'after'}`} the ${REL_TO[r.relativeTo] ?? r.relativeTo}`;
};

/** Everything about one task. Text fields are saved with Save; relations, comments and the done box act at once. */
export function TaskDetail({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (id: number) => void }) {
  const { projects, labels: allLabels, refreshMeta } = useStore();
  const [task, setTask] = useState<Task | null>(null);
  const [f, setF] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [labelDraft, setLabelDraft] = useState('');
  const [comment, setComment] = useState('');
  const [relKind, setRelKind] = useState('related');
  const [relQ, setRelQ] = useState('');
  const [relHits, setRelHits] = useState<Task[]>([]);

  const adopt = (t: Task) => {
    setTask(t);
    const unit = UNITS.slice().reverse().find(([, s]) => t.repeatAfter > 0 && t.repeatAfter % s === 0) ?? UNITS[1];
    setF({ title: t.title, description: t.description, projectId: t.projectId, dueDate: toLocalInput(t.dueDate), startDate: toLocalInput(t.startDate), endDate: toLocalInput(t.endDate), priority: t.priority, percentDone: t.percentDone,
      isFavorite: t.isFavorite, labels: t.labels.map((l) => l.title), reminders: t.reminders, repeatEvery: t.repeatAfter ? t.repeatAfter / unit[1] : 0, repeatUnit: unit[1], repeatMode: t.repeatMode });
    setSaved(true);
  };
  useEffect(() => { api.task(id).then(adopt, (e) => setError((e as Error).message)); }, [id]);
  useEffect(() => { if (relQ.trim().length < 2) { setRelHits([]); return; } const h = setTimeout(() => api.tasks({ q: relQ }).then((r) => setRelHits(r.filter((x) => x.id !== id).slice(0, 8))), 200); return () => clearTimeout(h); }, [relQ, id]);

  const set = (patch: Record<string, any>) => { setF((x) => ({ ...x, ...patch })); setSaved(false); };

  async function save() {
    setError(null);
    try {
      const body = {
        title: f.title, description: f.description, projectId: f.projectId, dueDate: fromLocalInput(f.dueDate), startDate: fromLocalInput(f.startDate), endDate: fromLocalInput(f.endDate), priority: Number(f.priority), percentDone: Number(f.percentDone),
        isFavorite: f.isFavorite, labels: f.labels, reminders: f.reminders, repeatAfter: f.repeatMode === 1 ? 0 : Math.round(Number(f.repeatEvery || 0) * f.repeatUnit), repeatMode: Number(f.repeatMode),
      };
      adopt(await api.updateTask(id, body)); void refreshMeta();
    } catch (e) { setError((e as Error).message); }
  }
  const act = async (p: Promise<Task>) => { try { adopt(await p); } catch (e) { setError((e as Error).message); } };
  if (!task) return <Dialog title="Task" onClose={onClose}>{error ? <div role="alert" className="text-sm text-bad">{error}</div> : <p className="text-sm text-muted">Loading…</p>}</Dialog>;

  const addLabel = (raw: string) => { const t = raw.trim(); if (t && !f.labels.includes(t)) set({ labels: [...f.labels, t] }); setLabelDraft(''); };
  const withDefault = (date: string) => date || toLocalInput(new Date(Date.now() + 86400000).toISOString());

  return (
    <Dialog title={`Task #${task.index}`} onClose={onClose} wide>
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-2.5 h-5 w-5 shrink-0" checked={task.done} onChange={() => void act(api.updateTask(id, { done: !task.done }))} aria-label={task.done ? 'Reopen task' : 'Complete task'} />
        <input className="input !text-lg font-semibold" aria-label="Title" value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
        <button className="btn btn-ghost !px-2" aria-pressed={f.isFavorite} title="Star" onClick={() => set({ isFavorite: !f.isFavorite })}><Star size={18} className={f.isFavorite ? 'fill-current text-warn' : ''} /></button>
      </div>
      {task.done && task.doneAt && <p className="text-xs text-muted">Done {new Date(task.doneAt).toLocaleString()}</p>}
      <label className="block space-y-1 text-sm">Description<textarea className="input min-h-[7rem] w-full" value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">Project<select className="input" value={f.projectId} onChange={(e) => set({ projectId: Number(e.target.value) })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.isInbox ? 'Inbox' : p.title}</option>)}</select></label>
        <label className="block space-y-1 text-sm">Priority<select className="input" value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>{PRIORITY.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></label>
        <label className="block space-y-1 text-sm">Due<input className="input" type="datetime-local" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">Start<input className="input" type="datetime-local" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">End<input className="input" type="datetime-local" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">Progress: {Math.round(f.percentDone * 100)}%<input type="range" className="bt-range bt-hit w-full" style={{ '--p': `${f.percentDone * 100}%` } as React.CSSProperties} min={0} max={100} step={10} value={Math.round(f.percentDone * 100)} onChange={(e) => set({ percentDone: Number(e.target.value) / 100 })} /></label>
      </div>

      <div className="space-y-1.5">
        <div className="text-sm">Labels</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {f.labels.map((l: string) => <span key={l} className="chip inline-flex items-center gap-1">{l}<button type="button" aria-label={`Remove label ${l}`} onClick={() => set({ labels: f.labels.filter((x: string) => x !== l) })}><X size={11} /></button></span>)}
          <input className="input !w-44" list="all-labels" aria-label="Add a label" placeholder="Add label" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel(labelDraft); } }} onBlur={() => labelDraft && addLabel(labelDraft)} />
          <datalist id="all-labels">{allLabels.map((l) => <option key={l.id} value={l.title} />)}</datalist>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-sm">Reminders</div>
        {f.reminders.map((r: Reminder, i: number) => (
          <div key={i} className="flex items-center gap-2">
            {r.reminder && !r.relativeTo ? <input className="input" type="datetime-local" aria-label="Reminder time" value={toLocalInput(r.reminder)} onChange={(e) => set({ reminders: f.reminders.map((x: Reminder, j: number) => (j === i ? { ...x, reminder: fromLocalInput(e.target.value) } : x)) })} /> : <span className="flex-1 text-sm text-muted">{relText(r)}</span>}
            <button type="button" className="btn btn-ghost !px-2" aria-label="Remove reminder" onClick={() => set({ reminders: f.reminders.filter((_: Reminder, j: number) => j !== i) })}><X size={15} /></button>
          </div>))}
        <button type="button" className="btn text-sm" onClick={() => set({ reminders: [...f.reminders, { reminder: fromLocalInput(withDefault(f.dueDate)), relativePeriod: 0, relativeTo: '' }] })}><Plus size={15} />Add reminder</button>
        <p className="text-xs text-muted">Reminders are stored and exported with the task. This server does not send notifications.</p>
      </div>

      <div className="space-y-1.5">
        <div className="text-sm">Repeat</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !w-auto" aria-label="Repeat mode" value={f.repeatMode} onChange={(e) => set({ repeatMode: Number(e.target.value) })}>
            <option value={0}>Every … from the due date</option><option value={2}>Every … from when I finish it</option><option value={1}>Every month</option>
          </select>
          {f.repeatMode !== 1 && <><input className="input !w-20" type="number" min={0} aria-label="Repeat every" value={f.repeatEvery} onChange={(e) => set({ repeatEvery: e.target.value })} />
            <select className="input !w-auto" aria-label="Unit" value={f.repeatUnit} onChange={(e) => set({ repeatUnit: Number(e.target.value) })}>{UNITS.map(([u, s]) => <option key={u} value={s}>{u}</option>)}</select></>}
        </div>
        <p className="text-xs text-muted">0 = does not repeat. Completing a repeating task keeps it open and moves its dates on.</p>
      </div>

      {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-accent" onClick={() => void save()} disabled={saved}>Save</button>
        <button className="btn" onClick={onClose}>{saved ? 'Close' : 'Discard'}</button>
        {!saved && <span className="text-xs text-warn">Unsaved changes</span>}
        <button className="btn ml-auto text-bad" onClick={async () => { if (confirm('Delete this task?')) { await api.deleteTask(id); onClose(); } }}><Trash2 size={15} />Delete</button>
      </div>

      <hr className="border-line" />
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Link2 size={15} />Related tasks</div>
        {Object.entries(task.related).map(([kind, list]) => (
          <div key={kind} className="text-sm"><span className="text-muted">{KINDS.find((k) => k[0] === kind)?.[1] ?? kind}: </span>
            {list.map((r) => <span key={r.id} className="mr-2 inline-flex items-center gap-1"><button className="underline decoration-dotted underline-offset-2" onClick={() => onOpen(r.id)}>{r.title}</button><button aria-label={`Remove relation to ${r.title}`} className="text-muted hover:text-bad" onClick={() => void act(api.removeRelation(id, r.id, kind))}><X size={12} /></button></span>)}</div>))}
        <div className="flex flex-wrap items-start gap-2">
          <select className="input !w-auto" aria-label="Relation kind" value={relKind} onChange={(e) => setRelKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <div className="relative min-w-[12rem] flex-1">
            <input className="input" aria-label="Find a task to relate" placeholder="Find a task…" value={relQ} onChange={(e) => setRelQ(e.target.value)} />
            {relHits.length > 0 && <ul className="bt-menu absolute left-0 right-0 z-10 mt-1 overflow-hidden py-1">{relHits.map((h) => <li key={h.id}><button className="block w-full truncate px-3 py-1.5 text-left text-sm" onClick={() => { setRelQ(''); void act(api.addRelation(id, h.id, relKind)); }}>{h.title}</button></li>)}</ul>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Comments</div>
        {task.comments.map((c) => (
          <div key={c.id} className="rounded-theme bg-raised/50 p-2.5 text-sm"><div className="mb-0.5 flex items-center gap-2 text-xs text-muted"><span>{c.author || 'someone'} · {new Date(c.createdAt).toLocaleString()}</span><button className="ml-auto hover:text-bad" aria-label="Delete comment" onClick={() => void act(api.deleteComment(id, c.id))}><X size={12} /></button></div><div className="whitespace-pre-line break-words">{c.comment}</div></div>))}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { const c = comment; setComment(''); void act(api.addComment(id, c)); } }}>
          <input className="input" aria-label="New comment" placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn" disabled={!comment.trim()}>Post</button></form>
      </div>
    </Dialog>
  );
}
