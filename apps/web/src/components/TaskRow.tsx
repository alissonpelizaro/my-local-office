import { ago, everyLabel, money, names, until, when } from '../format';
import { openTask, useOffice } from '../store';
import type { Task } from '../types';
import { Avatar, Chip, cx, StatusIcon, useNow } from './ui';
import { Icon } from './icons';

// Linha de tarefa reutilizada em todas as listas. Mostra quem, situação e a dica certa (agendada → quando).
export function TaskRow({ task: t, selected, onClick }: { task: Task; selected?: boolean; onClick?: () => void }) {
  const state = useOffice((s) => s.state);
  const name = names(state);
  useNow(30_000); // mantém "em 3 min" fresco
  const color = state.departments.find((d) => d.id === state.employees.find((e) => e.id === t.employee_id)?.department_id)?.color ?? '#999';
  const employee = state.employees.find((e) => e.id === t.employee_id);

  return (
    <button
      onClick={onClick ?? (() => openTask(t.id))}
      className={cx(
        'group flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition duration-150 hover:-translate-y-px hover:shadow-md dark:bg-zinc-900',
        selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700',
      )}
    >
      <StatusIcon status={t.status} repeat={!!t.repeat_every} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{t.title}</span>
          {t.repeat_every && <Chip tone="violet" icon="repeat">{everyLabel(t.repeat_every)}</Chip>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
          {employee && <Avatar name={employee.name} color={color} size="xs" />}
          <span className="truncate">{name(t.employee_id)}</span>
          {t.origin === 'agent' && <span className="truncate">· de {name(t.from_employee_id)}</span>}
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="whitespace-nowrap">
            {t.status === 'scheduled' && t.run_at ? until(t.run_at) : t.status === 'running' ? 'rodando' : t.finished_at ? ago(t.finished_at) : ago(t.created_at)}
          </span>
        </div>
      </div>
      {t.cost_usd > 0 && <span className="shrink-0 text-xs text-zinc-400 tabular-nums">{money(t.cost_usd)}</span>}
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600" />
    </button>
  );
}

export function nextScheduleHint(t: Task) {
  if (t.status !== 'scheduled' || !t.run_at) return null;
  return t.repeat_every ? `${everyLabel(t.repeat_every)} · próxima ${when(t.run_at)}` : `agendada ${when(t.run_at)}`;
}
