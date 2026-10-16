import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';

/** A search only looks through the page you are on; when the others hold results too, say so and offer to switch (the same words go with you). */
export function OtherPiles({ q, from, seed }: { q: string; from: 'home' | 'archive' | 'bin'; seed: number }) {
  const [counts, setCounts] = useState<{ home: number; archive: number; bin: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const n = (view: string) => api.notes({ view, q, excerpt: '1' }).then((l) => l.length, () => 0);
    void Promise.all([n('notes'), n('archived'), n('trashed')]).then(([home, archive, bin]) => alive && setCounts({ home, archive, bin }));
    return () => { alive = false; };
  }, [q, seed]);
  const nav = useNavigate();
  if (!counts) return null;
  const where = { home: ['Home', '/home'], archive: ['the Archive', '/archive'], bin: ['the Bin', '/bin'] } as const;
  const others = (['home', 'archive', 'bin'] as const).filter((k) => k !== from && counts[k] > 0);
  if (!others.length) return null;
  return (
    <div className="space-y-1.5 rounded-theme border border-line bg-raised/50 p-3 text-sm" role="status">
      {others.map((k) => (
        <p key={k}>There {counts[k] === 1 ? 'is 1 result' : `are ${counts[k]} results`} for this on {where[k][0]}. <button type="button" className="font-medium text-accent underline" onClick={() => nav(`${where[k][1]}?q=${encodeURIComponent(q)}`)}>Switch to {where[k][0]}?</button></p>))}
    </div>
  );
}
