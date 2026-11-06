import { useEffect, useRef } from 'react';
import { describe, names, time } from '../format';
import { useOffice, useT } from '../store';
import { Icon } from './icons';
import type { OfficeEvent } from '../types';
import { cx, Empty } from './ui';

// Log com autoscroll enquanto o usuário estiver no fim.
export function EventLog({ events, showWho = true, className }: { events: OfficeEvent[]; showWho?: boolean; className?: string }) {
  const t = useT();
  const name = names(useOffice((s) => s.state));
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const rows = events.flatMap((e) => {
    const d = describe(e);
    return d ? [{ e, ...d }] : [];
  });

  useEffect(() => {
    if (stick.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [rows.length]);

  return (
    <div
      ref={ref}
      onScroll={(ev) => {
        const el = ev.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={cx('overflow-y-auto text-xs', className)}
    >
      {rows.length === 0 && <Empty>{t.log.empty}</Empty>}
      {rows.map(({ e, icon, text, tone }) => (
        <div key={e.id} className="flex animate-fade-in gap-2 rounded-md px-1.5 py-1 leading-relaxed transition-colors hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.03]">
          <span className="shrink-0 font-mono text-[11px] text-zinc-400 tabular-nums">{time(e.ts)}</span>
          <Icon name={icon} className={cx('mt-0.5 h-3.5 w-3.5', tone === 'red' ? 'text-red-500' : tone === 'green' ? 'text-emerald-500' : 'text-zinc-400')} />
          <span className="line-clamp-4 min-w-0 whitespace-pre-wrap text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400">
            {showWho && <b className="mr-1 font-medium text-zinc-900 dark:text-zinc-200">{name(e.employeeId)}</b>}
            {text.length > 700 ? `${text.slice(0, 700)}…` : text}
          </span>
        </div>
      ))}
    </div>
  );
}
