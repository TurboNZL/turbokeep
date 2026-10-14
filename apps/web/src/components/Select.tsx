import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { usePresence } from '../lib/presence.ts';

export interface SelectOption { value: string; label: string; hint?: string; icon?: ReactNode; disabled?: boolean }

/**
 * A drop-down that is drawn by the UI style (a native <select> opens the operating system's own list, which no theme
 * can touch). The list is a `bt-menu`, so it has the style's shape, motion and highlight; long lists get a search box.
 * Keyboard: Up/Down, Home/End, Enter or Space to choose, Escape to close, typing jumps to a match.
 */
export function Select({ value, onChange, options, placeholder = 'Choose…', className, disabled, 'aria-label': ariaLabel, searchable, creatable }: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; placeholder?: string; className?: string; disabled?: boolean; 'aria-label'?: string; searchable?: boolean;
  /** typing a name that is not in the list offers "create it" as the first result; `create` makes it and returns the new value */
  creatable?: { label: (typed: string) => string; create: (typed: string) => string };
}) {
  const [open, setOpen] = useState(false);
  const { mounted, leaving } = usePresence(open);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const id = useId();
  const withSearch = searchable ?? (!!creatable || options.length > 12);
  const CREATE = '\u0000create';
  const shown = useMemo(() => {
    const found = q ? options.filter((o) => `${o.label} ${o.hint?.startsWith('aka ') ? o.hint : ''}`.toLowerCase().includes(q.toLowerCase())) : options;
    const typed = q.trim();
    const exact = options.some((o) => o.label.toLowerCase() === typed.toLowerCase());
    return creatable && typed && !exact ? [{ value: CREATE, label: creatable.label(typed), icon: <Plus size={14} className="shrink-0 text-accent" /> } as SelectOption, ...found] : found;
  }, [options, q, creatable]);
  // a value just made with `creatable` is not in the options yet: show it as typed instead of the placeholder
  const current = options.find((o) => o.value === value) ?? (creatable && value ? { value, label: value } as SelectOption : undefined);

  useLayoutEffect(() => {
    if (!mounted || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 200 && above > below;
      const maxHeight = Math.max(140, Math.min(320, up ? above : below));
      const width = Math.max(r.width, 176);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos(up ? { left, minWidth: width, bottom: window.innerHeight - r.top + 6, maxHeight, transformOrigin: `${r.left + r.width / 2 - left}px 100%` } : { left, minWidth: width, top: r.bottom + 6, maxHeight, transformOrigin: `${r.left + r.width / 2 - left}px 0` });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    setQ(''); setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    window.addEventListener('mousedown', down);
    return () => window.removeEventListener('mousedown', down);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi, mounted]);

  const choose = (o: SelectOption) => { if (o.disabled) return; onChange(o.value === CREATE ? creatable!.create(q.trim()) : o.value); setOpen(false); btn.current?.focus(); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); }
    else if (e.key === 'End') { e.preventDefault(); setHi(shown.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) { e.preventDefault(); if (shown[hi]) choose(shown[hi]); }
    else if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const next = shown.findIndex((o, i) => i > hi && o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      const any = next >= 0 ? next : shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (any >= 0) setHi(any);
    }
  };

  return (
    <>
      <button ref={btn} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={ariaLabel}
        className={cn('input bt-select flex items-center justify-between gap-2 text-left', className)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } else if (open) key(e); }}>
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-muted')}>{current?.label ?? placeholder}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {mounted && createPortal(
        <div ref={list} id={id} role="listbox" aria-label={ariaLabel} data-leaving={leaving || undefined} style={pos} onKeyDown={key}
          className="bt-menu bt-popover fixed z-[70] flex flex-col overflow-hidden py-1">
          {withSearch && <div className="px-2 pb-1"><input autoFocus className="input !py-1 text-sm" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={key} /></div>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 && <div className="px-3 py-2 text-sm text-muted">Nothing matches</div>}
            {shown.map((o, i) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} data-i={i} disabled={o.disabled}
                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-40', i === hi && 'bt-select-hi')}
                onMouseEnter={() => setHi(i)} onClick={() => choose(o)}>
                {o.icon}<span className="min-w-0 flex-1 truncate">{o.label}</span>{o.hint && <span className="shrink-0 text-xs text-muted">{o.hint}</span>}
                {o.value === value && <Check size={14} className="shrink-0 text-accent" />}
              </button>))}
          </div>
        </div>, document.body)}
    </>
  );
}
