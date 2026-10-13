import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Note, type Task } from '../lib/api.ts';

/** Notes and tasks matching the search box in the top bar. */
export function SearchPage() {
  const q = useSearchParams()[0].get('q') ?? '';
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => {
    setNotes(null); setTasks(null);
    void api.notes({ view: 'all', q }).then((n) => setNotes(n.filter((x) => !x.trashed)));
    void api.tasks({ q }).then(setTasks);
  }, [q]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Search: {q}</h1>
      <section className="space-y-2"><h2 className="font-semibold">Notes</h2>
        {notes === null ? <p className="text-sm text-muted">Searching…</p> : !notes.length ? <p className="text-sm text-muted">No notes.</p> :
          <ul className="space-y-1.5">{notes.map((n) => <li key={n.id}><Link className="card bt-row block px-3 py-2 hover:border-accent" to={`/notes/${n.id}`}><div className="truncate text-sm font-semibold">{n.title || n.text.split('\n')[0] || 'Untitled'}</div><div className="line-clamp-2 text-xs text-muted">{n.text.slice(0, 200)}</div></Link></li>)}</ul>}</section>
      <section className="space-y-2"><h2 className="font-semibold">Tasks</h2>
        {tasks === null ? <p className="text-sm text-muted">Searching…</p> : !tasks.length ? <p className="text-sm text-muted">No tasks.</p> :
          <ul className="space-y-1.5">{tasks.map((t) => <li key={t.id}><Link className="card bt-row block px-3 py-2 hover:border-accent" to={`/tasks?view=all&done=1&task=${t.id}`}><span className={t.done ? 'task-done text-sm' : 'text-sm'}>{t.title}</span></Link></li>)}</ul>}</section>
    </div>
  );
}
