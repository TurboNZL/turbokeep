import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A modal window in the themes' `.bt-window` look. Escape or a click outside closes it.
 * Focus goes to the window ONCE, when it opens. (It used to run again on every re-render of the parent, because `onClose` is a new function each
 * time: with the editor in a window, every autosave pulled the focus out of the text and typing stopped.)
 */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // an autoFocus field inside already has the focus: only take it when nothing in the window has it
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) close.current(); };
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('keydown', h); prev?.focus?.(); };
  }, []);
  // in the body, not inside the page: the page slides in with an animation, which makes its own stacking layer and left the top of a window under the bar
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-3 md:p-8" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`bt-window w-full outline-none ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <div className="bt-titlebar flex items-center justify-between px-4 py-2.5"><h2 className="text-sm font-semibold">{title}</h2><button type="button" className="bt-close" aria-label="Close" onClick={() => close.current()}><X size={16} /></button></div>
        <div className="bt-body space-y-4 p-4">{children}</div>
      </div>
    </div>, document.body);
}
