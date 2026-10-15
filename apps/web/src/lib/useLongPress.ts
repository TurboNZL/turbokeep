import { useRef } from 'react';

/**
 * Touch "hold": calls `onHold(x, y)` when a finger stays put for `ms`. Only touch and pen start it (a mouse has the right button), and moving more
 * than a few pixels (a scroll, a drag) cancels it. Props to spread on the element. The click that follows a hold is swallowed.
 */
export function useLongPress(onHold: (x: number, y: number) => void, ms = 480) {
  const t = useRef<number>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { window.clearTimeout(t.current); start.current = null; };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('input,textarea,select,[data-nohold]')) return;
      fired.current = false; start.current = { x: e.clientX, y: e.clientY };
      t.current = window.setTimeout(() => { fired.current = true; const s = start.current; start.current = null; if (s) { navigator.vibrate?.(12); onHold(s.x, s.y); } }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => { const s = start.current; if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel(); },
    onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel,
    onClickCapture: (e: React.MouseEvent) => { if (fired.current) { fired.current = false; e.preventDefault(); e.stopPropagation(); } },
  };
}
