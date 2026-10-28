import { useEffect, useRef } from 'react';
import { describe, names, time } from '../format';
import { useOffice } from '../store';
import type { OfficeEvent } from '../types';
import { cx, Empty } from './ui';

// Log com autoscroll enquanto o usuário estiver no fim.
export function EventLog({ events, showWho = true, className }: { events: OfficeEvent[]; showWho?: boolean; className?: string }) {
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
      {rows.length === 0 && <Empty>Sem atividade ainda.</Empty>}
      {rows.map(({ e, icon, text }) => (
        <div key={e.id} className="flex gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
          <span className="shrink-0 font-mono text-zinc-400">{time(e.ts)}</span>
          <span className="shrink-0">{icon}</span>
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {showWho && <b className="mr-1">{name(e.employeeId)}</b>}
            {text.length > 700 ? `${text.slice(0, 700)}…` : text}
          </span>
        </div>
      ))}
    </div>
  );
}
