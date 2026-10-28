import { useEffect, useState } from 'react';
import { money } from '../format';
import { api, toast, useOffice } from '../store';
import type { Costs } from '../types';
import { Card, cx, Dot, Empty, Select } from './ui';

const KINDS: [string, string][] = [
  ['task', 'Tasks'],
  ['consult', 'Consultas'],
  ['onboard', 'Onboarding'],
];

export function CostsTab() {
  const departments = useOffice((s) => s.state.departments);
  // Recarrega quando alguma task termina.
  const finished = useOffice((s) => s.state.tasks.filter((t) => t.finished_at).length);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Costs | null>(null);

  useEffect(() => {
    api<Costs>('GET', `/api/costs?days=${days}`).then(setData, (e) => toast(e.message));
  }, [days, finished]);

  const dept = (id: number | null) => departments.find((d) => d.id === id);
  const maxDay = Math.max(0.0001, ...(data?.byDay.map((d) => d.total) ?? []));

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Últimos {days} dias</div>
          <div className="text-3xl font-semibold">{money(data?.total ?? 0)}</div>
          <p className="mt-1 max-w-xl text-xs text-zinc-500">
            Valor que o Claude Code reporta por execução (preço de API). Na assinatura não é cobrado: serve para comparar quem consome mais do seu limite.
          </p>
        </div>
        <div className="w-40">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card title="Por dia">
        {data?.byDay.length ? (
          <div className="flex h-32 items-end gap-1">
            {data.byDay.map((d) => (
              <div key={d.day} className="group relative flex-1" title={`${d.day}: ${money(d.total)}`}>
                <div className="rounded-t bg-blue-500/80 group-hover:bg-blue-500" style={{ height: `${Math.max(2, (d.total / maxDay) * 120)}px` }} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>Sem execuções no período.</Empty>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card title="Por departamento">
          <div className="grid gap-2">
            {data?.byDepartment.map((d) => (
              <div key={d.departmentId ?? 'x'} className="text-sm">
                <div className="flex items-center gap-2">
                  <Dot color={dept(d.departmentId)?.color ?? '#999'} />
                  <span className="flex-1">{dept(d.departmentId)?.name ?? 'Removido'}</span>
                  <b>{money(d.total)}</b>
                </div>
                <div className="mt-1 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded" style={{ width: `${(d.total / (data.total || 1)) * 100}%`, background: dept(d.departmentId)?.color ?? '#999' }} />
                </div>
              </div>
            ))}
            {!data?.byDepartment.length && <Empty>—</Empty>}
          </div>
        </Card>

        <Card title="Por funcionário">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-medium">Funcionário</th>
                {KINDS.map(([, label]) => (
                  <th key={label} className="py-1 text-right font-medium">
                    {label}
                  </th>
                ))}
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data?.byEmployee.map((e) => (
                <tr key={`${e.employeeId}-${e.name}`} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <Dot color={dept(e.departmentId)?.color ?? '#999'} />
                      <span className={cx(e.employeeId == null && 'text-zinc-400 line-through')}>{e.name}</span>
                      <span className="text-xs text-zinc-400">{e.runs}×</span>
                    </span>
                  </td>
                  {KINDS.map(([kind]) => (
                    <td key={kind} className="py-1.5 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                      {e.byKind[kind] ? money(e.byKind[kind]) : '—'}
                    </td>
                  ))}
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.byEmployee.length && <Empty>—</Empty>}
        </Card>
      </div>
    </div>
  );
}
