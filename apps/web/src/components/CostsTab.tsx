import { useEffect, useMemo, useState } from 'react';
import { money, shortDate } from '../format';
import { api, toast, useOffice, useT } from '../store';
import type { Costs } from '../types';
import { Avatar, Card, cx, Dot, Empty, Segmented, Skeleton } from './ui';

const KINDS = ['task', 'consult', 'onboard'];

// Série contínua de dias: dia sem uso vira barra zero, em vez de sumir do eixo.
function fillDays(byDay: Costs['byDay'], days: number) {
  const map = new Map(byDay.map((d) => [d.day, d.total]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, total: map.get(day) ?? 0 };
  });
}

const shortDay = (day: string) => shortDate(`${day}T12:00:00Z`, { day: '2-digit', month: 'short' });

export function CostsTab() {
  const t = useT();
  const departments = useOffice((s) => s.state.departments);
  // Recarrega quando alguma task termina.
  const finished = useOffice((s) => s.state.tasks.filter((t) => t.finished_at).length);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Costs | null>(null);

  useEffect(() => {
    api<Costs>('GET', `/api/costs?days=${days}`).then(setData, (e) => toast(e.message));
  }, [days, finished]);

  const dept = (id: number | null) => departments.find((d) => d.id === id);
  const series = useMemo(() => (data ? fillDays(data.byDay, days) : []), [data, days]);
  const maxDay = Math.max(0.0001, ...series.map((d) => d.total));
  const runs = data?.byEmployee.reduce((s, e) => s + e.runs, 0) ?? 0;
  const top = data?.byEmployee[0];

  return (
    <div className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.costs.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">{t.costs.subtitle}</p>
        </div>
        <Segmented value={days} onChange={setDays} options={[7, 30, 90].map((d) => ({ value: d, label: t.costs.days(d) }))} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.costs.totalIn(days)} value={data ? money(data.total) : null} big />
        <Stat label={t.costs.perDay} value={data ? money(data.total / days) : null} />
        <Stat label={t.costs.runs} value={data ? String(runs) : null} />
        <Stat label={t.costs.top} value={data ? (top?.name ?? '—') : null} sub={top ? money(top.total) : undefined} />
      </div>

      <Card title={t.costs.byDay}>
        {!data ? (
          <Skeleton className="h-40 w-full" />
        ) : data.total === 0 ? (
          <Empty icon="chart" title={t.costs.noRuns} />
        ) : (
          <>
            <div key={days} className="flex h-40 items-end gap-[3px]">
              {series.map((d, i) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                  <div
                    className={cx('w-full origin-bottom animate-grow-y rounded-t-[3px] transition-colors', d.total ? 'bg-blue-500/75 group-hover:bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-800')}
                    style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%`, animationDelay: `${Math.min(i * 12, 500)}ms` }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 translate-y-1 rounded-lg bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 dark:bg-zinc-700">
                    {shortDay(d.day)} · <b>{money(d.total)}</b>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-zinc-400">
              <span>{shortDay(series[0].day)}</span>
              <span>{shortDay(series[Math.floor(series.length / 2)].day)}</span>
              <span>{t.costs.today}</span>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-[1fr_2fr]">
        <Card title={t.costs.byDept}>
          <div className="grid gap-3">
            {data?.byDepartment.map((d, i) => (
              <div key={d.departmentId ?? 'x'} className="text-sm">
                <div className="flex items-center gap-2">
                  <Dot color={dept(d.departmentId)?.color ?? '#999'} />
                  <span className="flex-1 truncate">{dept(d.departmentId)?.name ?? t.common.removed}</span>
                  <b className="tabular-nums">{money(d.total)}</b>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full origin-left animate-grow-x rounded-full"
                    style={{ width: `${(d.total / (data.total || 1)) * 100}%`, background: dept(d.departmentId)?.color ?? '#999', animationDelay: `${i * 60}ms` }}
                  />
                </div>
              </div>
            ))}
            {data && !data.byDepartment.length && <Empty>—</Empty>}
            {!data && <Skeleton className="h-24 w-full" />}
          </div>
        </Card>

        <Card title={t.costs.byEmployee}>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="px-2 py-1.5 font-medium">{t.costs.employee}</th>
                  {KINDS.map((kind) => (
                    <th key={kind} className="px-2 py-1.5 text-right font-medium">
                      {t.costs.kinds[kind]}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right font-medium">{t.costs.total}</th>
                </tr>
              </thead>
              <tbody>
                {data?.byEmployee.map((e) => (
                  <tr key={`${e.employeeId}-${e.name}`} className="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={e.name} color={dept(e.departmentId)?.color ?? '#999'} size="xs" />
                        <span className={cx('truncate', e.employeeId == null && 'text-zinc-400 line-through')}>{e.name}</span>
                        <span className="text-xs text-zinc-400">{e.runs}×</span>
                      </span>
                    </td>
                    {KINDS.map((kind) => (
                      <td key={kind} className="px-2 py-2 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                        {e.byKind[kind] ? money(e.byKind[kind]) : '—'}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{money(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && !data.byEmployee.length && <Empty>—</Empty>}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string | null; sub?: string; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="text-xs text-zinc-500">{label}</div>
      {value === null ? (
        <Skeleton className="mt-2 h-6 w-20" />
      ) : (
        <div key={value} className={cx('mt-1 animate-fade-in truncate font-semibold tabular-nums', big ? 'text-2xl' : 'text-lg')}>
          {value}
        </div>
      )}
      {sub && <div className="text-xs text-zinc-400 tabular-nums">{sub}</div>}
    </div>
  );
}
