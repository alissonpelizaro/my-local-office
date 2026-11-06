import { ACTIVITY_ICON, money, STATUS_TONE } from '../format';
import { openChat, openNewTask, openTask, type PanelTab, selectEmployee, setPanelTab, startReplay, useOffice, useT } from '../store';
import { ApprovalCard } from './ApprovalCard';
import { ChatView } from './ChatView';
import { EmployeeSettings } from './EmployeeSettings';
import { SessionsView } from './SessionsView';
import { Avatar, Button, Chip, Segmented } from './ui';
import { Icon } from './icons';

const TABS: PanelTab[] = ['chat', 'history', 'settings'];

export function EmployeePanel({ employeeId }: { employeeId: number }) {
  const t = useT();
  const state = useOffice((s) => s.state);
  const tab = useOffice((s) => s.panelTab);
  const e = state.employees.find((x) => x.id === employeeId);
  const dept = state.departments.find((d) => d.id === e?.department_id);
  const provider = state.providers.find((p) => p.id === e?.provider_id);
  // Pedidos fora de uma conversa aberta ficam visíveis em qualquer aba.
  const approvals = state.approvals.filter((a) => a.employee_id === employeeId && a.kind !== 'delegation');

  if (!e) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={e.name} color={dept?.color ?? '#999'} size="lg" activity={e.activity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg leading-tight font-semibold">{e.name}</span>
            <Chip tone={e.activity === 'idle' ? 'default' : e.activity === 'waiting' ? 'amber' : 'blue'} icon={ACTIVITY_ICON[e.activity]}>
              {t.activity[e.activity]}
            </Chip>
            {e.kind === 'intern' && (
              <Chip tone="violet" icon="intern">
                {t.common.intern}
              </Chip>
            )}
          </div>
          <div className="truncate text-xs text-zinc-500" title={e.repo_path}>
            {dept?.name} · {provider ? `${provider.name} (${provider.model})` : (e.model ?? state.settings.defaultModel)}
          </div>
        </div>
        <Button variant="ghost" size="icon" icon="plus" title={t.panel.newTask} onClick={() => openNewTask(e.id)} />
        <Button variant="ghost" size="icon" icon="x" onClick={() => selectEmployee(null)} aria-label={t.common.close} />
      </div>

      <Segmented value={tab} onChange={setPanelTab} options={TABS.map((id) => ({ value: id, label: t.panel.tabs[id] }))} className="w-full [&>button]:flex-1" size="sm" />

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
  const t = useT();
  // Filtra fora do seletor: array novo a cada leitura faz o zustand re-renderizar em loop (tela branca).
  const tasks = useOffice((s) => s.state.tasks).filter((x) => x.employee_id === employeeId);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      <SessionsView employeeId={employeeId} />
      {tasks.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{t.panel.recent}</h3>
          <ul className="grid grid-cols-1 gap-1">
            {tasks.slice(0, 12).map((x) => (
              <li key={x.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => openChat(employeeId, { kind: 'thread', id: x.thread_id })}>
                  <span className="text-zinc-400">#{x.id}</span> {x.title}
                </button>
                <Chip tone={STATUS_TONE[x.status]}>{t.status[x.status]}</Chip>
                {x.cost_usd > 0 && <span className="text-xs text-zinc-400 tabular-nums">{money(x.cost_usd)}</span>}
                <button title={t.panel.details} className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => openTask(x.id)}>
                  <Icon name="external" className="h-3.5 w-3.5" />
                </button>
                {!['scheduled', 'paused', 'queued', 'pending_approval'].includes(x.status) && (
                  <button title={t.panel.watch} className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => startReplay(x.id)}>
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
