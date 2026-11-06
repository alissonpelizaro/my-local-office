import { useEffect, useState } from 'react';
import { refresh, useOffice, useT } from '../store';
import { Button, cx } from './ui';

// Cobre a janela inteira até o estado chegar e a cena do escritório estar desenhada; depois some com fade.
export function LoadingScreen({ done }: { done: boolean }) {
  const t = useT();
  const failed = useOffice((s) => s.loadFailed && !s.loaded);
  const loaded = useOffice((s) => s.loaded);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!done) return setGone(false);
    const timer = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(timer);
  }, [done]);
  if (gone) return null;

  const step = failed ? t.loading.offline : loaded ? t.loading.building : t.loading.connecting;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'fixed inset-0 z-[100] grid place-items-center bg-zinc-50 transition-opacity duration-400 dark:bg-zinc-950',
        done && 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <Building animate={!failed} />
        <div className="grid gap-2">
          <div className="text-lg font-semibold tracking-tight">My Local Office</div>
          <div key={step} className="animate-fade-in text-sm text-zinc-500">
            {step}
          </div>
        </div>
        {failed ? (
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>
            {t.common.retry}
          </Button>
        ) : (
          <div className="h-1 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className={cx('h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-[var(--ease-out-expo)]', loaded ? 'w-4/5' : 'w-1/3')}>
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Prédio isométrico: os andares descem e encaixam um por um, em loop.
function Building({ animate }: { animate: boolean }) {
  const floors = [0, 1, 2];
  return (
    <svg viewBox="0 0 120 130" className="h-32 w-32 drop-shadow-xl" aria-hidden>
      <ellipse cx="60" cy="112" rx="40" ry="10" className="fill-zinc-900/10 dark:fill-black/40" />
      {floors.map((i) => (
        <g key={i} transform={`translate(0 ${-i * 22})`}>
          <g className={animate ? 'loader-floor' : undefined} style={{ animationDelay: `${i * 0.28}s` }}>
            <path d="M20 78 L60 98 L60 120 L20 100 Z" className="fill-blue-700" />
            <path d="M100 78 L60 98 L60 120 L100 100 Z" className="fill-blue-800" />
            <path d="M60 58 L100 78 L60 98 L20 78 Z" className={i === floors.length - 1 ? 'fill-blue-400' : 'fill-blue-500'} />
            {[0, 1, 2].map((w) => (
              <g key={w}>
                <path d={`M${27 + w * 11} ${86 + w * 5.5} l6 3 v7 l-6 -3 Z`} className="fill-sky-200/90" />
                <path d={`M${93 - w * 11} ${86 + w * 5.5} l-6 3 v7 l6 -3 Z`} className="fill-sky-300/70" />
              </g>
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}
