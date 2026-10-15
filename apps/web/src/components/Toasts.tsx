import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';

/** Short messages (and "Undo") above the dock. They never take the focus. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts), dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-3" style={{ bottom: 'calc(var(--dock-h, 0px) + 1rem)' }} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn('bt-menu pointer-events-auto flex max-w-md items-center gap-3 px-4 py-2.5 text-sm tk-toast', t.tone === 'bad' && 'text-bad')}>
          <span className="min-w-0">{t.message}</span>
          {t.action && <button className="shrink-0 font-semibold text-accent underline-offset-2 hover:underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
        </div>))}
    </div>
  );
}
