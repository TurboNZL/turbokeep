import { useState } from 'react';
import { api, type TagInfo } from '../lib/api.ts';
import { Dialog } from './Dialog.tsx';
import { cn } from '../lib/cn.ts';

const EMOJI = ['⭐', '🏠', '💼', '🛒', '📚', '💡', '🎯', '📅', '✅', '❤️', '🔥', '🎵', '✈️', '💰', '🍳', '🧠', '🛠️', '🌱', '🎮', '📌'];
const COLORS = ['e10600', 'ff8800', 'f2b705', '2fb344', '12b5a5', '2f80ed', '7c5cff', 'd63fa6', '8a8f98'];

/** Name, emoji and colour of one tag. Renaming a tag to the name of another merges them (the server does that). */
export function TagDialog({ tag, onClose, onDone }: { tag: TagInfo; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(tag.title);
  const [emoji, setEmoji] = useState(tag.emoji);
  const [color, setColor] = useState(tag.color);
  const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      const to = name.trim();
      if (to && to !== tag.title) await api.renameTag(tag.title, to);
      await api.styleTag(to || tag.title, { emoji, color });
      onDone();
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <Dialog title={`Tag: ${tag.title}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="block space-y-1 text-sm">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /><span className="text-xs text-muted">A dot makes a sub-tag: <code>work.reports</code> sits under <code>work</code>.</span></label>
        <div className="space-y-1.5 text-sm">
          <span>Emoji</span>
          <div className="flex items-center gap-2"><input className="input !w-20 text-center text-lg" aria-label="Emoji" value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-2).join(''))} placeholder="🙂" />{emoji && <button type="button" className="btn btn-ghost text-xs" onClick={() => setEmoji('')}>None</button>}</div>
          <div className="flex flex-wrap gap-1">{EMOJI.map((x) => <button key={x} type="button" className={cn('h-8 w-8 rounded-theme text-lg hover:bg-raised', emoji === x && 'bg-raised ring-1 ring-accent')} onClick={() => setEmoji(x)} aria-label={`Use ${x}`}>{x}</button>)}</div>
        </div>
        <div className="space-y-1.5 text-sm">
          <span>Colour</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {COLORS.map((c) => <button key={c} type="button" aria-label={`Colour #${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full border border-line', color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-transparent')} style={{ backgroundColor: `#${c}` }} />)}
            <input type="color" aria-label="Other colour" value={`#${color || '808080'}`} onChange={(e) => setColor(e.target.value.slice(1))} className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent" />
            {color && <button type="button" className="btn btn-ghost text-xs" onClick={() => setColor('')}>No colour</button>}
          </div>
        </div>
        {error && <div role="alert" className="rounded-theme bg-bad/15 p-2.5 text-sm text-bad">{error}</div>}
        <div className="flex flex-wrap gap-2"><button className="btn btn-accent">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn ml-auto text-bad" onClick={async () => { if (confirm(`Remove the tag "${tag.title}" from all its notes?`)) { await api.deleteTag(tag.title); onDone(); } }}>Delete tag</button></div>
      </form>
    </Dialog>
  );
}
