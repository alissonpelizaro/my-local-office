import { dismissToast, TOAST_MS, useOffice } from '../store';
import { Icon, type IconName } from './icons';
import { cx } from './ui';

const TONE: Record<string, { icon: IconName; className: string; bar: string }> = {
  error: { icon: 'alert', className: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
  success: { icon: 'check', className: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  info: { icon: 'bell', className: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' },
};

export function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] grid w-[min(380px,calc(100vw-2rem))] gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.tone] ?? TONE.info;
        return (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-white p-3 pr-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900',
              t.leaving ? 'toast-leave' : 'animate-slide-in',
            )}
          >
            <Icon name={tone.icon} className={cx('mt-0.5 h-5 w-5', tone.className)} />
            <p className="flex-1 py-0.5 text-sm">{t.text}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismissToast(t.id)} aria-label="Dispensar" className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
            {!t.leaving && <span className={cx('countdown absolute bottom-0 left-0 h-0.5 w-full', tone.bar)} style={{ animationDuration: `${TOAST_MS}ms` }} />}
          </div>
        );
      })}
    </div>
  );
}
