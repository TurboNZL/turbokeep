import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CheckSquare, ChevronDown, Eye, EyeOff, FileText, Pencil, Tag, X } from 'lucide-react';
import { Emoji } from '../lib/emoji.tsx';
import { cn } from '../lib/cn.ts';
import { useArrivals } from '../lib/arrivals.ts';
import type { TagInfo } from '../lib/api.ts';
import type { RailTag } from '../lib/tagTree.ts';
import type { HomeFilter, Scope } from '../lib/views.ts';

/**
 * The left column of Home: the Tasks list (what has a checkbox), every note, what is due soon, then your tags (with their emoji and colour).
 * One click switches what Home shows. On a phone it lies down into a strip of chips above the list. A tag also matches the tags nested under it
 * ("work" shows "work.reports"). Its height stops above the dock, so the last tags can always be reached.
 */
export function TagRail({ tags, filter, onScope, onTag, onEditTag, counts, archive, showAll, onShowAll }: {
  /** the "show all tags" toggle (temporary: it is not saved) */ showAll: boolean; onShowAll: (v: boolean) => void;
  tags: RailTag[]; filter: HomeFilter; /** the Archive: no "Due soon" (finished things are not due) */ archive?: boolean; onScope: (s: Scope) => void; onTag: (t: string) => void; onEditTag: (t: TagInfo) => void; counts: { list: number | null };
}) {
  const arrived = useArrivals(tags.map((t) => t.title));
  const [sheet, setSheet] = useState(false); // phones: all the tags in a sheet from the bottom of the screen
  const current = filter.tag ? tags.find((t) => t.title === filter.tag) : undefined;
  const toggle = (cls: string) => <button type="button" onClick={() => onShowAll(!showAll)} aria-pressed={showAll} title="Also show tags with nothing in them here (not saved)" className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 normal-case tracking-normal hover:text-fg', showAll && 'text-accent', cls)}>{showAll ? <Eye size={12} /> : <EyeOff size={12} />}Show all</button>;
  const chip = 'flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-theme px-2.5 py-1.5 text-left text-sm hover:bg-raised max-lg:flex-1 max-lg:justify-center max-lg:gap-1.5 max-lg:border max-lg:border-line max-lg:px-2 max-lg:py-1 lg:w-full';
  const on = (s: Scope) => !filter.tag && filter.scope === s;
  const every: { id: Scope; label: string; icon: typeof Tag; n?: number | null }[] = [
    { id: 'list', label: archive ? 'Old Tasks' : 'Tasks', icon: CheckSquare, n: counts.list }, { id: 'all', label: 'All notes', icon: FileText }, { id: 'due', label: 'Due soon', icon: CalendarClock },
  ];
  const scopes = every.filter((s) => !(archive && s.id === 'due'));
  return (
    <nav aria-label="Tasks and tags" className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:flex-col lg:gap-0.5 lg:self-start lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0"
      style={{ maxHeight: 'calc(100dvh - 6.5rem - var(--dock-h, 0px))' }}>
      {scopes.map((s) => (
        <button key={s.id} onClick={() => onScope(s.id)} aria-current={on(s.id) || undefined} className={cn(chip, on(s.id) && 'bg-raised font-medium text-accent')}>
          <s.icon size={15} className="shrink-0 max-sm:hidden" /><span className="min-w-0 flex-1 truncate">{s.label}</span>{s.n ? <span className="text-xs text-muted">{s.n}</span> : null}
        </button>))}
      <div className="mb-0.5 mt-3 hidden items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted lg:flex"><Tag size={12} />Tags<span className="flex-1" />{toggle('text-[11px] font-medium')}</div>
      <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className={cn(chip, 'lg:hidden', current && 'bg-raised font-medium text-accent')}><Tag size={15} className="shrink-0" /><span className="min-w-0 truncate">{current ? current.title.split('.').pop() : 'Tags'}</span><ChevronDown size={14} className="shrink-0 text-muted" /></button>
      {tags.map((t) => {
        const depth = t.title.split('.').length - 1, sel = filter.tag === t.title, bar = t.color; // the tags column shows the tag's OWN colour only (a sub-tag does not borrow its parent's here)
        return (
          <div key={t.title} className={cn('group relative flex shrink-0 items-center max-lg:hidden lg:w-full', arrived.has(t.title) && 'tk-arrive')}>
            <button onClick={() => onTag(sel ? '' : t.title)} aria-current={sel || undefined} title={t.title} className={cn(chip, 'lg:pr-9', sel && 'bg-raised pr-7 font-medium text-accent')}
              style={{ ...(bar ? { boxShadow: `inset 4px 0 0 #${bar}`, paddingLeft: '0.9rem' } : null), fontSize: 'var(--rail-text, 0.875rem)' }}>
              {t.emoji && <span className="inline-flex shrink-0 items-center" style={{ fontSize: 'var(--rail-emoji, 1.25rem)', lineHeight: 1 }}><Emoji value={t.emoji} /></span>}
              <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: `${depth * 0.75}rem` }}>{depth > 0 && <span aria-hidden className="text-muted">– </span>}{t.title.split('.').pop()}</span><span className="text-xs text-muted">{t.total}</span>
            </button>
            <button className={cn('absolute right-1 rounded p-1.5 text-muted hover:text-fg', sel ? 'block' : 'hidden lg:group-hover:block lg:group-focus-within:block')} onClick={() => onEditTag(t)} aria-label={`Edit tag ${t.title}`} title="Emoji, colour, name"><Pencil size={13} /></button>
          </div>);
      })}
      {!tags.length && <p className="hidden px-2.5 text-xs text-muted lg:block">{archive ? 'Nothing archived is filed under a tag.' : 'Notes you send to tags show up here.'}</p>}
      {sheet && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div role="dialog" aria-modal="true" aria-label="Tags" className="bt-window tk-sheet flex max-h-[82dvh] w-full flex-col rounded-b-none">
            <div className="flex items-center gap-2 px-4 py-3"><h2 className="flex-1 text-base font-semibold">Tags</h2>{toggle('text-xs')}<button type="button" className="bt-close" aria-label="Close" onClick={() => setSheet(false)}><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {current && <button type="button" className="btn col-span-2 !min-h-12 justify-center text-muted" onClick={() => { onTag(''); setSheet(false); }}><X size={15} />Stop filtering by {current.title.split('.').pop()}</button>}
              {tags.map((t) => {
                const depth = t.title.split('.').length - 1, sel = filter.tag === t.title;
                return (
                  <div key={t.title} className="relative min-w-0">
                    <button type="button" aria-current={sel || undefined} onClick={() => { onTag(sel ? '' : t.title); setSheet(false); }} className={cn('btn !min-h-12 w-full justify-start gap-2 !px-3 !pr-9 text-left', sel && 'btn-accent')}
                      style={t.color && !sel ? { boxShadow: `inset 4px 0 0 #${t.color}` } : undefined}>
                      {t.emoji ? <span className="inline-flex shrink-0 items-center"><Emoji value={t.emoji} /></span> : null}
                      <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: `${depth * 0.5}rem` }}>{depth > 0 && '– '}{t.title.split('.').pop()}</span><span className="text-xs opacity-70">{t.total}</span>
                    </button>
                    <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted" onClick={() => { setSheet(false); onEditTag(t); }} aria-label={`Edit tag ${t.title}`}><Pencil size={13} /></button>
                  </div>);
              })}
              {!tags.length && <p className="col-span-2 py-6 text-center text-sm text-muted">{archive ? 'Nothing archived is filed under a tag.' : 'Notes you send to tags show up here.'}</p>}
            </div>
          </div>
        </div>, document.body)}
    </nav>
  );
}
