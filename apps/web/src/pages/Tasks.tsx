import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, CalendarClock, CheckSquare, Flag, Folder, Inbox, ListTodo, Plus, Repeat, Star, Tag } from 'lucide-react';
import { api, type Project, type Task } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { fmtDay, isOverdue } from '../lib/dates.ts';
import { TaskDetail } from '../components/TaskDetail.tsx';
import { ProjectDialog } from '../components/ProjectDialog.tsx';

const SMART = [
  { id: 'today', label: 'Today', icon: Calendar, query: { due: 'today' } },
  { id: 'week', label: 'Next 7 days', icon: CalendarClock, query: { due: 'week' } },
  { id: 'overdue', label: 'Overdue', icon: Flag, query: { due: 'overdue' } },
  { id: 'favorites', label: 'Starred', icon: Star, query: { favorites: '1' } },
  { id: 'all', label: 'All tasks', icon: ListTodo, query: {} },
] as const;

/** Projects in tree order, each with its depth. */
function tree(projects: Project[]): { p: Project; depth: number }[] {
  const out: { p: Project; depth: number }[] = [];
  const kids = (parent: number | null) => projects.filter((p) => (p.parentId ?? null) === parent && !p.isInbox);
  const walk = (parent: number | null, depth: number) => { for (const p of kids(parent)) { out.push({ p, depth }); walk(p.id, depth + 1); } };
  walk(null, 0);
  return out;
}

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const { projects, labels, refreshMeta } = useStore();
  const inbox = projects.find((p) => p.isInbox);
  const view = params.get('view') || (inbox ? `project:${inbox.id}` : 'all');
  const showDone = params.get('done') === '1';
  const openId = Number(params.get('task')) || null;
  const q = params.get('q') ?? '';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editProject, setEditProject] = useState<Project | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const query = useMemo(() => {
    const m = /^(project|label):(\d+)$/.exec(view);
    const base: Record<string, string | undefined> = m ? (m[1] === 'project' ? { project: m[2] } : { label: m[2] }) : { ...(SMART.find((s) => s.id === view)?.query ?? {}) };
    if (!showDone && view !== 'overdue') base.done = 'false';
    if (q) base.q = q;
    return base;
  }, [view, showDone, q]);

  const load = useCallback(async () => {
    try { setTasks(await api.tasks(query)); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (params.get('new')) { const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); document.getElementById('quick-add')?.focus(); } }, [params, setParams]);

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const refresh = () => { void load(); void refreshMeta(); };

  const project = /^project:(\d+)$/.exec(view) ? projects.find((p) => p.id === Number(/^project:(\d+)$/.exec(view)![1])) : undefined;
  const label = /^label:(\d+)$/.exec(view) ? labels.find((l) => l.id === Number(/^label:(\d+)$/.exec(view)![1])) : undefined;
  const title = project?.title ?? (label ? `Label: ${label.title}` : SMART.find((s) => s.id === view)?.label ?? 'Tasks');
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    const extra: Record<string, unknown> = {};
    if (project) extra.projectId = project.id;
    if (label) extra.labels = [label.title];
    if (view === 'today') { const d = new Date(); d.setHours(23, 59, 0, 0); extra.dueDate = d.toISOString(); }
    try { await api.createTask({ title: t, ...extra }); refresh(); } catch (err) { setError((err as Error).message); setDraft(t); }
  }
  async function toggle(t: Task) {
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))); // shows at once; a repeating task comes back from the server still open
    try { await api.updateTask(t.id, { done: !t.done }); } finally { refresh(); }
  }

  const shown = projects.filter((p) => showArchived || !p.isArchived);
  const nav = (id: string, text: string, Icon: typeof Inbox, count?: number, depth = 0) => (
    <button key={id} onClick={() => set('view', id)} aria-current={view === id || undefined} style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
      className={cn('flex w-full items-center gap-2 rounded-theme py-1.5 pr-2 text-left text-sm hover:bg-raised', view === id && 'bg-raised font-medium text-accent')}>
      <Icon size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{text}</span>{count ? <span className="text-xs text-muted">{count}</span> : null}
    </button>);

  return (
    <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Task lists" className="space-y-4 md:sticky md:top-20 md:self-start">
        <div className="md:hidden">
          <select className="input" aria-label="List" value={view} onChange={(e) => set('view', e.target.value)}>
            {SMART.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            {shown.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.isInbox ? 'Inbox' : p.title}</option>)}
            {labels.map((l) => <option key={l.id} value={`label:${l.id}`}>Label: {l.title}</option>)}
          </select>
        </div>
        <div className="hidden space-y-4 md:block">
          <div className="space-y-0.5">{inbox && nav(`project:${inbox.id}`, 'Inbox', Inbox, inbox.openTasks)}{SMART.map((s) => nav(s.id, s.label, s.icon))}</div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Projects</span><button className="text-muted hover:text-fg" onClick={() => setEditProject('new')} aria-label="New project" title="New project"><Plus size={14} /></button></div>
            {tree(shown).map(({ p, depth }) => nav(`project:${p.id}`, p.title, Folder, p.openTasks, depth))}
            {projects.some((p) => p.isArchived) && <label className="flex items-center gap-2 px-2 pt-1 text-xs text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>}
          </div>
          {labels.length > 0 && <div className="space-y-0.5"><div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Labels</div>{labels.map((l) => nav(`label:${l.id}`, l.title, Tag))}</div>}
        </div>
        <button className="btn w-full text-sm md:hidden" onClick={() => setEditProject('new')}><Plus size={15} />New project</button>
      </nav>

      <section className="min-w-0 space-y-3" aria-label={title}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto min-w-0 truncate text-2xl font-bold">{title}</h1>
          {project && !project.isInbox && <button className="btn text-sm" onClick={() => setEditProject(project)}>Edit project</button>}
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showDone} onChange={(e) => set('done', e.target.checked ? '1' : '')} />Show done</label>
        </div>
        {project?.description && <p className="whitespace-pre-line text-sm text-muted">{project.description}</p>}
        <form onSubmit={add} className="flex gap-2"><input id="quick-add" className="input" aria-label="New task" placeholder={`Add a task${project ? ` to ${project.title}` : ''}`} value={draft} onChange={(e) => setDraft(e.target.value)} /><button className="btn btn-accent" disabled={!draft.trim()}><Plus size={16} />Add</button></form>
        {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
        {!loading && !tasks.length && !error && <p className="py-10 text-center text-sm text-muted"><CheckSquare className="mx-auto mb-2" />{q ? 'Nothing matches.' : 'Nothing here. Add a task above.'}</p>}
        <ul className="card divide-y divide-line overflow-hidden">
          {tasks.map((t) => (
            <li key={t.id} className="bt-row flex items-start gap-3 px-3 py-2.5">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 cursor-pointer" checked={t.done} onChange={() => void toggle(t)} aria-label={`${t.done ? 'Reopen' : 'Complete'}: ${t.title}`} />
              <button className="min-w-0 flex-1 text-left" onClick={() => set('task', String(t.id))}>
                <div className={cn('break-words text-sm', t.done && 'task-done')}>{t.isFavorite && <Star size={12} className="mr-1 inline text-warn" />}{t.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {t.dueDate && <span className={cn('inline-flex items-center gap-1', isOverdue(t.dueDate, t.done) && 'font-medium text-bad')}><Calendar size={11} />{fmtDay(t.dueDate)}</span>}
                  {t.repeatAfter > 0 || t.repeatMode === 1 ? <Repeat size={11} aria-label="Repeats" /> : null}
                  {t.priority >= 3 && <span className={cn('inline-flex items-center gap-0.5', t.priority >= 4 ? 'text-bad' : 'text-warn')}><Flag size={11} />P{t.priority}</span>}
                  {!project && byId.get(t.projectId) && <span>{byId.get(t.projectId)!.isInbox ? 'Inbox' : byId.get(t.projectId)!.title}</span>}
                  {t.labels.map((l) => <span key={l.id} className="chip" style={l.hexColor ? { borderColor: `#${l.hexColor}` } : undefined}>{l.title}</span>)}
                  {t.commentCount > 0 && <span>{t.commentCount} comment{t.commentCount === 1 ? '' : 's'}</span>}
                </div>
              </button>
            </li>))}
        </ul>
      </section>

      {openId && <TaskDetail id={openId} onClose={() => { set('task', ''); refresh(); }} onOpen={(id) => set('task', String(id))} />}
      {editProject && <ProjectDialog project={editProject === 'new' ? null : editProject} onClose={() => setEditProject(null)} onDone={(go) => { setEditProject(null); refresh(); if (go) set('view', go); }} />}
    </div>
  );
}
