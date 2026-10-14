import { Folder, Pencil, Plus, Tag } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import type { Project, TagInfo } from '../lib/api.ts';

/**
 * Tags (and the task lists, "projects") as a column to the left of the notes: one click switches what Home shows. On a phone it lies down into a
 * strip of chips above the list. A tag also matches the tags nested under it ("work" shows "work.reports").
 */
export function TagRail({ tags, tag, onTag, onEditTag, projects, project, onProject, onNewProject, onEditProject }: {
  tags: TagInfo[]; tag: string; onTag: (t: string) => void; onEditTag: (t: TagInfo) => void;
  projects: Project[]; project: string; onProject: (id: string) => void; onNewProject: () => void; onEditProject: (p: Project) => void;
}) {
  const lists = projects.filter((p) => !p.isInbox && !p.isArchived);
  const chip = 'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-theme px-2.5 py-1.5 text-left text-sm hover:bg-raised max-lg:border max-lg:border-line max-lg:py-1 lg:w-full';
  return (
    <nav aria-label="Tags and lists" className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:gap-0.5 lg:self-start lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
      <div className="mb-0.5 hidden items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted lg:flex"><Tag size={12} />Tags</div>
      <button onClick={() => onTag('')} aria-current={!tag || undefined} className={cn(chip, !tag && 'bg-raised font-medium text-accent')}>All</button>
      {tags.map((t) => {
        const depth = t.title.split('.').length - 1, on = tag === t.title;
        return (
          <div key={t.title} className="group relative flex shrink-0 items-center lg:w-full">
            <button onClick={() => onTag(on ? '' : t.title)} aria-current={on || undefined} title={t.title} className={cn(chip, 'lg:pr-8', on && 'bg-raised pr-7 font-medium text-accent')}
              style={t.color ? { borderLeft: `3px solid #${t.color}` } : undefined}>
              {t.emoji && <span aria-hidden>{t.emoji}</span>}
              <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: `${depth * 0.75}rem` }}>{t.title.split('.').pop()}</span><span className="text-xs text-muted">{t.count}</span>
            </button>
            <button className={cn('absolute right-1 rounded p-1 text-muted hover:text-fg', on ? 'block' : 'hidden lg:group-hover:block lg:group-focus-within:block')} onClick={() => onEditTag(t)} aria-label={`Edit tag ${t.title}`} title="Emoji, colour, name"><Pencil size={12} /></button>
          </div>);
      })}
      {!tags.length && <p className="hidden px-2.5 text-xs text-muted lg:block">Tags you add to notes show up here.</p>}

      <div className="mb-0.5 mt-3 hidden items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted lg:flex">
        <Folder size={12} />Lists<button className="ml-auto text-muted hover:text-fg" onClick={onNewProject} aria-label="New list" title="New list"><Plus size={14} /></button>
      </div>
      {lists.map((p) => (
        <div key={p.id} className="group relative flex shrink-0 items-center lg:w-full">
          <button onClick={() => onProject(project === String(p.id) ? '' : String(p.id))} aria-current={project === String(p.id) || undefined} className={cn(chip, 'pr-7', project === String(p.id) && 'bg-raised font-medium text-accent')}>
            <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: `${(p.parentId ? 1 : 0) * 0.75}rem` }}>{p.title}</span>{p.openTasks > 0 && <span className="text-xs text-muted">{p.openTasks}</span>}
          </button>
          <button className="absolute right-1 hidden rounded p-1 text-muted hover:text-fg group-hover:block max-lg:hidden" onClick={() => onEditProject(p)} aria-label={`Edit list ${p.title}`}><Pencil size={12} /></button>
        </div>))}
      <button className={cn(chip, 'text-muted lg:hidden')} onClick={onNewProject}><Plus size={14} />List</button>
    </nav>
  );
}
