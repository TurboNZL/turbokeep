import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** A modal window in the themes' `.bt-window` look. Escape or a click outside closes it. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('keydown', h); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-3 md:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`bt-window w-full outline-none ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <div className="bt-titlebar flex items-center justify-between px-4 py-2.5"><h2 className="text-sm font-semibold">{title}</h2><button type="button" className="bt-close" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <div className="bt-body space-y-4 p-4">{children}</div>
      </div>
    </div>
  );
}
