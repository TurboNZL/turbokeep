import { useState } from 'react';
import { api, type Project } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { Dialog } from './Dialog.tsx';
import { Select } from './Select.tsx';

/** Create or edit a project: name, description, colour, where it sits, archived. */
export function ProjectDialog({ project, onClose, onDone }: { project: Project | null; onClose: () => void; onDone: (goTo?: string) => void }) {
  const projects = useStore((s) => s.projects);
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [hexColor, setHexColor] = useState(project?.hexColor ?? '');
  const [parentId, setParentId] = useState<number | null>(project?.parentId ?? null);
  const [isArchived, setIsArchived] = useState(project?.isArchived ?? false);
  const [error, setError] = useState<string | null>(null);

  // a project cannot move under itself or its own children
  const blocked = new Set<number>();
  if (project) { blocked.add(project.id); let grew = true; while (grew) { grew = false; for (const p of projects) if (p.parentId && blocked.has(p.parentId) && !blocked.has(p.id)) { blocked.add(p.id); grew = true; } } }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      const body = { title, description, hexColor, parentId, isArchived };
      if (project) { await api.updateProject(project.id, body); onDone(); } else { const p = await api.createProject(body); onDone(`project:${p.id}`); }
    } catch (err) { setError((err as Error).message); }
  }
  async function remove() {
    if (!project || !confirm(`Delete the project "${project.title}" and all of its tasks?`)) return;
    try { await api.deleteProject(project.id); onDone('all'); } catch (err) { setError((err as Error).message); }
  }
  return (
    <Dialog title={project ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block space-y-1 text-sm">Name<input className="input" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block space-y-1 text-sm">Description<textarea className="input min-h-[5rem] w-full" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="block space-y-1 text-sm"><span>Inside</span><Select aria-label="Inside" value={parentId == null ? '' : String(parentId)} onChange={(v) => setParentId(v ? Number(v) : null)} options={[{ value: '', label: 'Top level' }, ...projects.filter((p) => !p.isInbox && !blocked.has(p.id)).map((p) => ({ value: String(p.id), label: p.title }))]} /></div>
          <label className="block space-y-1 text-sm">Colour<span className="flex items-center gap-2"><input type="color" aria-label="Colour" value={`#${hexColor || '808080'}`} onChange={(e) => setHexColor(e.target.value.slice(1))} className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" />{hexColor && <button type="button" className="btn btn-ghost text-xs" onClick={() => setHexColor('')}>No colour</button>}</span></label>
        </div>
        {project && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />Archived</label>}
        {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
        <div className="flex flex-wrap gap-2"><button className="btn btn-accent">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button>{project && <button type="button" className="btn ml-auto text-bad" onClick={() => void remove()}>Delete project</button>}</div>
      </form>
    </Dialog>
  );
}
