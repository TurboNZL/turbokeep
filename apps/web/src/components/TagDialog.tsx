import { useState } from 'react';
import { Emoji } from '../lib/emoji.tsx';
import { api, type TagInfo } from '../lib/api.ts';
import { Dialog } from './Dialog.tsx';
import { EmojiPicker } from './EmojiPicker.tsx';
import { cn } from '../lib/cn.ts';

const COLORS = ['e10600', 'ff6a00', 'ffb020', 'f2dc3d', '7ac943', '2fb344', '12b5a5', '2fb8e8', '2f80ed', '5b5bf0', '8b5cf6', 'd63fa6', 'f43f5e', '8a8f98'];

/** Name, emoji and colour of one tag. The colour is what colours every note carrying the tag, so it should be easy to see. Renaming onto another tag merges them. */
export function TagDialog({ tag, onClose, onDone, implied }: { tag: TagInfo; onClose: () => void; onDone: () => void; /** a parent that only exists as the front of its sub-tags' names */ implied?: boolean }) {
  const [name, setName] = useState(tag.title);
  const [emoji, setEmoji] = useState(tag.emoji);
  const [color, setColor] = useState(tag.color);
  const [picking, setPicking] = useState(false);
  const [keep, setKeep] = useState(!!tag.keepTasks);
  const [retired, setRetired] = useState(!!tag.retired);
  const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      const to = name.trim();
      if (to && to !== tag.title) await api.renameTag(tag.title, to);
      await api.styleTag(to || tag.title, { emoji, color, keepTasks: keep, retired });
      onDone();
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <Dialog title={`Tag: ${tag.title}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" className="btn !h-14 !w-14 shrink-0 !p-0 text-3xl" aria-expanded={picking} aria-label={emoji ? 'Change the emoji' : 'Choose an emoji'} onClick={() => setPicking((p) => !p)}>{emoji ? <Emoji value={emoji} className="!h-10 !w-10" /> : '🙂'}</button>
          <label className="block min-w-0 flex-1 space-y-1 text-sm">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        </div>
        <p className="-mt-2 text-xs text-muted">A dot makes a sub-tag: <code>work.reports</code> sits under <code>work</code>. Renaming a tag renames the tags under it too.</p>
        {picking && <div className="rounded-theme border border-line p-2"><EmojiPicker value={emoji} onPick={(u) => { setEmoji(u); setPicking(false); }} />{emoji && <button type="button" className="btn btn-ghost mt-2 text-xs" onClick={() => { setEmoji(''); setPicking(false); }}>No emoji</button>}</div>}
        <div className="space-y-1.5 text-sm">
          <span>Colour <span className="text-muted">(tints every note with this tag)</span></span>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((c) => <button key={c} type="button" aria-label={`Colour #${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn('h-9 w-9 rounded-full border border-line', color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-transparent')} style={{ backgroundColor: `#${c}` }} />)}
            <input type="color" aria-label="Other colour" value={`#${color || '808080'}`} onChange={(e) => setColor(e.target.value.slice(1))} className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" />
            {color && <button type="button" className="btn btn-ghost text-xs" onClick={() => setColor('')}>No colour</button>}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span>Archived tasks stay tasks. (Off: when you archive a task that has this tag, it is sent to the tag, so it is found there.)</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={retired} onChange={(e) => setRetired(e.target.checked)} /><span>Don't offer this tag when adding tags. (The notes that have it keep it and it stays in the list; it just stops appearing as a suggestion. Typing its exact name still adds it.)</span></label>
        {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
        <div className="flex flex-wrap gap-2"><button className="btn btn-accent">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn ml-auto text-bad" onClick={async () => { if (confirm(implied ? `Remove "${tag.title}" and every tag under it from all their notes?` : `Remove the tag "${tag.title}" from all its notes? (Tags under it stay.)`)) { await api.deleteTag(tag.title, implied); onDone(); } }}>Delete tag</button></div>
      </form>
    </Dialog>
  );
}
