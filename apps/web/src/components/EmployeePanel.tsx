import { useMemo } from 'react';
import { ACTIVITY, money, STATUS } from '../format';
import { openChat, openTask, type PanelTab, selectEmployee, setPanelTab, startReplay, useOffice } from '../store';
import { ApprovalCard } from './ApprovalCard';
import { ChatView } from './ChatView';
import { EmployeeSettings } from './EmployeeSettings';
import { EventLog } from './EventLog';
import { SessionsView } from './SessionsView';
import { Button, Chip, cx, Dot } from './ui';

const TABS: [PanelTab, string][] = [
  ['chat', '💬 Conversa'],
  ['sessions', '🗂️ Sessões'],
  ['activity', '📡 Atividade'],
  ['settings', '⚙️ Configurar'],
];

export function EmployeePanel({ employeeId }: { employeeId: number }) {
  const state = useOffice((s) => s.state);
  const tab = useOffice((s) => s.panelTab);
  const e = state.employees.find((x) => x.id === employeeId);
  const dept = state.departments.find((d) => d.id === e?.department_id);
  const provider = state.providers.find((p) => p.id === e?.provider_id);
  // Pedidos fora de uma conversa aberta (ex.: de outra conversa) ficam visíveis em qualquer aba.
  const approvals = state.approvals.filter((a) => a.employee_id === employeeId && a.kind !== 'delegation');

  if (!e) return null;
  const activity = ACTIVITY[e.activity];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Dot color={dept?.color ?? '#999'} /> {e.name}
            <Chip tone={e.activity === 'idle' ? 'default' : e.activity === 'waiting' ? 'amber' : 'blue'}>
              {activity.icon} {activity.label}
            </Chip>
          </div>
          <div className="truncate text-xs text-zinc-500" title={e.repo_path}>
            {dept?.name} · {provider ? `${provider.name} (${provider.model})` : (e.model ?? state.settings.defaultModel)} · {e.git_remote ?? e.repo_path}
          </div>
        </div>
        <Button variant="ghost" onClick={() => selectEmployee(null)} aria-label="Fechar">
          ✕
        </Button>
      </div>

      <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPanelTab(id)}
            className={cx('-mb-px border-b-2 px-2 py-1.5 text-xs font-medium', tab === id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab !== 'chat' && approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}

      <div className="min-h-0 flex-1">
        {tab === 'chat' && <ChatView key={e.id} employee={e} />}
        {tab === 'sessions' && <SessionsView employee={e} />}
        {tab === 'activity' && <ActivityView employeeId={e.id} />}
        {tab === 'settings' && (
          <div className="h-full overflow-y-auto pr-1">
            <EmployeeSettings e={e} />
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityView({ employeeId }: { employeeId: number }) {
  const events = useOffice((s) => s.events);
  const tasks = useOffice((s) => s.state.tasks);
  const log = useMemo(() => events.filter((x) => x.employeeId === employeeId).slice(-300), [events, employeeId]);
  const mine = tasks.filter((t) => t.employee_id === employeeId).slice(0, 10);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <EventLog events={log} showWho={false} className="min-h-0 flex-1 rounded-md border border-zinc-200 px-2 dark:border-zinc-800" />
      {mine.length > 0 && (
        <ul className="grid max-h-48 gap-1 overflow-y-auto">
          {mine.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openChat(employeeId, { kind: 'thread', id: t.thread_id })}>
                #{t.id} {t.title}
              </button>
              <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
              <span className="text-xs text-zinc-500">{money(t.cost_usd)}</span>
              <button className="text-xs" title="Detalhes da task" onClick={() => openTask(t.id)}>
                📋
              </button>
              {!['queued', 'pending_approval'].includes(t.status) && (
                <button className="text-xs" title="Assistir replay no escritório" onClick={() => startReplay(t.id)}>
                  ▶️
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
