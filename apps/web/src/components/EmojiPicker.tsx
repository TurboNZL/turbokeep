import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../lib/cn.ts';

interface E { g: number; l: string; t: string; u: string }
const GROUPS: { id: number; icon: string; label: string }[] = [
  { id: -1, icon: '🕘', label: 'Recent' }, { id: 0, icon: '😀', label: 'Smileys' }, { id: 1, icon: '👋', label: 'People' }, { id: 3, icon: '🐻', label: 'Animals and nature' },
  { id: 4, icon: '🍔', label: 'Food and drink' }, { id: 5, icon: '✈️', label: 'Travel and places' }, { id: 6, icon: '⚽', label: 'Activities' },
  { id: 7, icon: '💡', label: 'Objects' }, { id: 8, icon: '❤️', label: 'Symbols' }, { id: 9, icon: '🏳️', label: 'Flags' },
];
const RECENT_KEY = 'turbokeep.recentEmoji';
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; } };

let cache: E[] | null = null;
/** The emoji list (about 1,900 with names and keywords, 84 kB compressed) is its own file, fetched when a picker first opens. */
async function load(): Promise<E[]> {
  if (cache) return cache;
  const raw = (await import('emojibase-data/en/compact.json')).default as unknown as { group?: number; label: string; tags?: string[]; unicode: string; order?: number }[];
  cache = raw.filter((e) => e.group !== undefined && e.group !== 2).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((e) => ({ g: e.group!, l: e.label, t: (e.tags ?? []).join(' '), u: e.unicode }));
  return cache;
}

/**
 * Pick an emoji: search by name or keyword ("cart", "home"), browse by group, recently used first. Large buttons, so a finger can hit them.
 * Each one is labelled with its name for a screen reader.
 */
export function EmojiPicker({ value, onPick }: { value: string; onPick: (emoji: string) => void }) {
  const [list, setList] = useState<E[] | null>(cache);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(() => (readRecent().length ? -1 : 0));
  const [recent, setRecent] = useState(readRecent);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { let on = true; void load().then((l) => on && setList(l)); return () => { on = false; }; }, []);
  useEffect(() => { grid.current?.scrollTo({ top: 0 }); }, [group, q]);
  const shown = useMemo<{ u: string; l: string }[]>(() => {
    if (!list) return [];
    const s = q.trim().toLowerCase();
    if (s) return list.filter((e) => e.l.toLowerCase().includes(s) || e.t.toLowerCase().includes(s)).slice(0, 240);
    if (group === -1) return recent.map((u) => list.find((e) => e.u === u)).filter((e): e is E => !!e);
    return list.filter((e) => e.g === group);
  }, [list, q, group, recent]);
  const pick = (u: string) => {
    const next = [u, ...recent.filter((x) => x !== u)].slice(0, 24);
    setRecent(next); try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private window */ }
    onPick(u);
  };
  return (
    <div className="space-y-2" aria-label="Emoji picker">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input !pl-9" type="search" aria-label="Search emoji" placeholder="Search emoji: home, cart, heart…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!q && <div className="flex gap-0.5 overflow-x-auto pb-1" role="tablist" aria-label="Emoji groups">
        {GROUPS.filter((g) => g.id !== -1 || recent.length).map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} title={g.label} aria-label={g.label} onClick={() => setGroup(g.id)}
            className={cn('h-10 w-10 shrink-0 rounded-theme text-xl hover:bg-raised', group === g.id && 'bg-raised ring-1 ring-accent')}>{g.icon}</button>))}
      </div>}
      <div ref={grid} className="grid max-h-60 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-0.5 overflow-y-auto" role="listbox" aria-label="Emoji">
        {!list && <p className="col-span-full p-3 text-sm text-muted">Loading emoji…</p>}
        {list && !shown.length && <p className="col-span-full p-3 text-sm text-muted">{q ? 'No emoji matches that.' : 'Nothing here yet.'}</p>}
        {shown.map((e) => (
          <button key={e.u} type="button" role="option" aria-selected={value === e.u} aria-label={e.l} title={e.l} onClick={() => pick(e.u)}
            className={cn('h-10 rounded-theme text-2xl leading-none hover:bg-raised', value === e.u && 'bg-raised ring-1 ring-accent')}>{e.u}</button>))}
      </div>
    </div>
  );
}
