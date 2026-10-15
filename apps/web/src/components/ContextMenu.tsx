import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.ts';

export interface MenuItem { key: string; label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void; /** a line above this one */ divider?: boolean }

/**
 * The menu of an item: opened by a right click, a long press or the "more" button. It is a `bt-menu` drawn on the page itself (a portal, fixed
 * position, above the dock), clamped to the window so it never hangs off an edge, and closed by Escape, a click elsewhere or a scroll.
 */
export function ContextMenu({ x, y, items, onClose, label }: { x: number; y: number; items: MenuItem[]; onClose: () => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 0; // stay above the bar at the bottom
    const r = box.current!.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight - dock;
    setPos({ left: Math.max(8, Math.min(x, vw - r.width - 8)), top: Math.max(8, y + r.height > vh - 8 ? Math.max(8, vh - r.height - 8) : y) });
  }, [x, y]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const els = [...box.current!.querySelectorAll<HTMLElement>('[role=menuitem]')], i = els.indexOf(document.activeElement as HTMLElement);
      els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
    };
    const off = () => close.current();
    window.addEventListener('keydown', key); window.addEventListener('resize', off); window.addEventListener('scroll', off, true);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', off); window.removeEventListener('scroll', off, true); };
  }, []);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onPointerDown={() => onClose()} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={box} role="menu" aria-label={label} style={pos} className="bt-menu bt-popover fixed z-[91] w-60 max-w-[calc(100vw-1rem)] overflow-hidden py-1">
        {items.map((i) => (
          <div key={i.key}>
            {i.divider && <div className="my-1 border-t border-line" role="separator" />}
            <button role="menuitem" type="button" className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm', i.danger && 'text-bad')} onClick={() => { onClose(); i.onSelect(); }}>
              <span className="grid w-4 shrink-0 place-items-center">{i.icon}</span><span className="min-w-0 flex-1 truncate">{i.label}</span>
            </button>
          </div>))}
      </div>
    </>, document.body);
}
