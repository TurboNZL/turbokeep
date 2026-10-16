import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, type TagCounts } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { Section } from './Section.tsx';
import { TagDialog } from './TagDialog.tsx';

type Row = TagCounts & { implied: boolean };

/** Every tag in the list, parents (that only exist as the front of a sub-tag's name) included, in the order the tags column uses. */
function withParents(tags: TagCounts[]): Row[] {
  const own = new Map(tags.map((t) => [t.title, t]));
  const titles = new Set<string>();
  for (const t of tags) { const p = t.title.split('.'); for (let i = 1; i <= p.length; i++) titles.add(p.slice(0, i).join('.')); }
  return [...titles].sort((a, b) => a.toLowerCase().split('.').join('\u0000').localeCompare(b.toLowerCase().split('.').join('\u0000'))).map((title) => {
    const t = own.get(title);
    return { title, emoji: t?.emoji ?? '', color: t?.color ?? '', notes: t?.notes ?? 0, tasks: t?.tasks ?? 0, archived: t?.archived ?? 0, trashed: t?.trashed ?? 0, implied: !t };
  });
}

/**
 * Settings > Items: all your tags wherever their notes are (Home, the task list, the Archive, the Bin), with how many each place holds. Edit a tag's name, emoji
 * and colour, or delete it. A tag with nothing under it disappears by itself, so the list only ever holds tags that are in use.
 */
export function TagManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const refreshMeta = useStore((s) => s.refreshMeta);
  const load = useCallback(() => api.tagsEverywhere().then((t) => { setRows(withParents(t)); setError(''); }, (e: Error) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const done = () => { setEditing(null); void refreshMeta(); void load(); };
  const cell = (n: number) => <td className={`px-2 py-1.5 text-right tabular-nums ${n ? '' : 'text-muted/50'}`}>{n}</td>;
  return (
    <Section title="Tags">
      <p className="text-sm text-muted">Every tag, wherever its notes are. <b>Notes</b> are the ones sent to the tag, <b>Tasks</b> are tasks that carry it (they stay on your list until you send them), then the Archive and the Bin. A tag with nothing under it is deleted by itself.</p>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {rows && !rows.length && <p className="text-sm text-muted">No tags yet. Send a note to a tag and it shows up here.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="px-2 py-1.5 font-semibold">Tag</th><th className="px-2 py-1.5 text-right font-semibold">Notes</th><th className="px-2 py-1.5 text-right font-semibold">Tasks</th><th className="px-2 py-1.5 text-right font-semibold">Archive</th><th className="px-2 py-1.5 text-right font-semibold">Bin</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.title} className="border-t border-line/60">
                  <td className="px-2 py-1.5" style={t.color ? { boxShadow: `inset 4px 0 0 #${t.color}` } : undefined}>
                    <span className="flex items-center gap-2" style={{ paddingLeft: `${(t.title.split('.').length - 1) * 1 + 0.4}rem` }}>
                      {t.emoji && <span aria-hidden>{t.emoji}</span>}<span className="min-w-0 truncate" title={t.title}>{t.title.split('.').pop()}</span>
                      {t.implied && <span className="text-xs text-muted">(parent)</span>}
                    </span>
                  </td>
                  {cell(t.notes)}{cell(t.tasks)}{cell(t.archived)}{cell(t.trashed)}
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <button type="button" className="btn btn-ghost !px-2" aria-label={`Edit tag ${t.title}`} title="Name, emoji, colour" onClick={() => setEditing(t)}><Pencil size={15} /></button>
                    <button type="button" className="btn btn-ghost !px-2 text-bad" aria-label={`Delete tag ${t.title}`} title="Delete"
                      onClick={async () => { if (confirm(t.implied ? `Remove "${t.title}" and every tag under it from all their notes?` : `Remove the tag "${t.title}" from all its notes? (Tags under it stay.)`)) { await api.deleteTag(t.title, t.implied); done(); } }}><Trash2 size={15} /></button>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      {editing && <TagDialog tag={{ title: editing.title, emoji: editing.emoji, color: editing.color, count: editing.notes }} implied={editing.implied} onClose={() => setEditing(null)} onDone={done} />}
    </Section>
  );
}
