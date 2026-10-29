import { ACTIVITY, money, STATUS } from '../format';
import { openChat, openNewTask, openTask, type PanelTab, selectEmployee, setPanelTab, startReplay, useOffice } from '../store';
import { ApprovalCard } from './ApprovalCard';
import { ChatView } from './ChatView';
import { EmployeeSettings } from './EmployeeSettings';
import { SessionsView } from './SessionsView';
import { Avatar, Button, Chip, Segmented } from './ui';
import { Icon } from './icons';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'chat', label: 'Conversa' },
  { id: 'history', label: 'Histórico' },
  { id: 'settings', label: 'Configurar' },
];

export function EmployeePanel({ employeeId }: { employeeId: number }) {
  const state = useOffice((s) => s.state);
  const tab = useOffice((s) => s.panelTab);
  const e = state.employees.find((x) => x.id === employeeId);
  const dept = state.departments.find((d) => d.id === e?.department_id);
  const provider = state.providers.find((p) => p.id === e?.provider_id);
  // Pedidos fora de uma conversa aberta ficam visíveis em qualquer aba.
  const approvals = state.approvals.filter((a) => a.employee_id === employeeId && a.kind !== 'delegation');

  if (!e) return null;
  const activity = ACTIVITY[e.activity];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={e.name} color={dept?.color ?? '#999'} size="lg" activity={e.activity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg leading-tight font-semibold">{e.name}</span>
            <Chip tone={e.activity === 'idle' ? 'default' : e.activity === 'waiting' ? 'amber' : 'blue'}>
              {activity.icon} {activity.label}
            </Chip>
          </div>
          <div className="truncate text-xs text-zinc-500" title={e.repo_path}>
            {dept?.name} · {provider ? `${provider.name} (${provider.model})` : (e.model ?? state.settings.defaultModel)}
          </div>
        </div>
        <Button variant="ghost" size="icon" icon="plus" title="Nova tarefa para este funcionário" onClick={() => openNewTask(e.id)} />
        <Button variant="ghost" size="icon" icon="x" onClick={() => selectEmployee(null)} aria-label="Fechar" />
      </div>

      <Segmented value={tab} onChange={setPanelTab} options={TABS.map((t) => ({ value: t.id, label: t.label }))} className="w-full [&>button]:flex-1" size="sm" />

      {tab !== 'chat' &&
        approvals.map((a) => (
          <div key={a.id} className="animate-rise">
            <ApprovalCard approval={a} />
          </div>
        ))}

      <div className="min-h-0 flex-1">
        {tab === 'chat' && <ChatView key={e.id} employee={e} />}
        {tab === 'history' && <HistoryView employeeId={e.id} />}
        {tab === 'settings' && (
          <div className="h-full overflow-y-auto pr-1">
            <EmployeeSettings e={e} />
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryView({ employeeId }: { employeeId: number }) {
  // Filtra fora do seletor: array novo a cada leitura faz o zustand re-renderizar em loop (tela branca).
  const tasks = useOffice((s) => s.state.tasks).filter((t) => t.employee_id === employeeId);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      <SessionsView employeeId={employeeId} />
      {tasks.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Tarefas recentes</h3>
          <ul className="grid gap-1">
            {tasks.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => openChat(employeeId, { kind: 'thread', id: t.thread_id })}>
                  <span className="text-zinc-400">#{t.id}</span> {t.title}
                </button>
                <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
                {t.cost_usd > 0 && <span className="text-xs text-zinc-400 tabular-nums">{money(t.cost_usd)}</span>}
                <button title="Detalhes" className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => openTask(t.id)}>
                  <Icon name="external" className="h-3.5 w-3.5" />
                </button>
                {!['scheduled', 'paused', 'queued', 'pending_approval'].includes(t.status) && (
                  <button title="Assistir no escritório" className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => startReplay(t.id)}>
                    <Icon name="play" className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
