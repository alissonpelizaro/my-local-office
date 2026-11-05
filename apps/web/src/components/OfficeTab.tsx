import { useMemo, useState, useSyncExternalStore } from 'react';
import { ACTIVITY } from '../format';
import { OfficeCanvas, officeView } from '../office/OfficeCanvas';
import { openNewTask, selectEmployee, setInbox, setTab, stopReplay, useOffice } from '../store';
import { EmployeePanel } from './EmployeePanel';
import { EventLog } from './EventLog';
import { Icon } from './icons';
import { Avatar, Button, Card, cx, Dot } from './ui';

const narrow = window.matchMedia('(max-width: 1023px)');
const subscribeNarrow = (cb: () => void) => (narrow.addEventListener('change', cb), () => narrow.removeEventListener('change', cb));

export function OfficeTab() {
  const loaded = useOffice((s) => s.loaded);
  const empty = useOffice((s) => s.state.departments.length === 0);
  const replay = useOffice((s) => s.replay);
  const isNarrow = useSyncExternalStore(subscribeNarrow, () => narrow.matches);
  // Celular trava renderizando a cena: em tela estreita começa recolhido e o canvas nem é criado. Replay abre sozinho.
  const [collapsed, setCollapsed] = useState(narrow.matches);
  const hidden = isNarrow && collapsed && !replay && !empty;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {hidden ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
        >
          <Icon name="building" className="h-4 w-4" /> Mostrar escritório
          <Icon name="chevronDown" className="ml-auto h-4 w-4" />
        </button>
      ) : (
        <div className="relative h-[45vh] shrink-0 overflow-hidden lg:h-auto lg:flex-1">
          <OfficeCanvas onBoss={() => selectEmployee(null)} />
  
          {replay && (
            <div className="absolute top-3 left-1/2 flex -translate-x-1/2 animate-rise items-center gap-3 rounded-full bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">
              <Icon name="play" className="h-4 w-4" />
              <span>Replay #{replay.taskId}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
                <span className="block h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${(replay.index / replay.total) * 100}%` }} />
              </span>
              <button className="rounded-full bg-white/15 px-2 py-0.5 text-xs transition hover:bg-white/25" onClick={stopReplay}>
                Parar
              </button>
            </div>
          )}
  
          <div className="absolute bottom-3 left-3 flex gap-2">
            <Button variant="secondary" size="sm" icon="maximize" onClick={() => officeView.fit()} title="Arrastar move · roda do mouse dá zoom">
              Centralizar
            </Button>
            {isNarrow && !replay && (
              <Button variant="secondary" size="sm" icon="minus" onClick={() => setCollapsed(true)} title="Recolher o escritório (alivia o celular)">
                Recolher
              </Button>
            )}
          </div>
  
          {loaded && empty && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
              <Card className="pointer-events-auto max-w-sm animate-pop text-center">
                <div className="mb-3 text-4xl">🏢</div>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">O escritório ainda está vazio. Importe seus repositórios para contratar os funcionários.</p>
                <Button variant="primary" icon="download" onClick={() => setTab('config')}>
                  Importar repositórios
                </Button>
              </Card>
            </div>
          )}
        </div>
      )}

      <aside className="flex min-h-0 w-full flex-1 flex-col border-t border-zinc-200 bg-white p-4 lg:w-[480px] lg:flex-none lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-zinc-950">
        <SidePanel />
      </aside>
    </div>
  );
}

function SidePanel() {
  const selected = useOffice((s) => s.selectedEmployeeId);
  return <div className="min-h-0 flex-1 overflow-y-auto">{selected != null ? <EmployeePanel employeeId={selected} /> : <Overview />}</div>;
}

function Overview() {
  const { departments, employees, tasks, approvals } = useOffice((s) => s.state);
  const events = useOffice((s) => s.events);
  const recent = useMemo(() => events.slice(-150), [events]);
  const running = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Equipe" value={employees.length} icon="users" />
        <Stat label="Rodando" value={running} icon="zap" tone={running ? 'blue' : undefined} />
        <button onClick={() => setInbox(true)} className="text-left">
          <Stat label="Pedidos" value={approvals.length} icon="bell" tone={approvals.length ? 'red' : undefined} />
        </button>
      </div>

      {departments.map((d) => {
        const team = employees.filter((e) => e.department_id === d.id);
        if (!team.length) return null;
        return (
          <div key={d.id}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Dot color={d.color} /> {d.name}
              <span className="text-xs font-normal text-zinc-400">{team.length}</span>
            </h3>
            <div className="grid gap-1.5">
              {team.map((e) => (
                <div
                  key={e.id}
                  className="group flex items-center gap-2.5 rounded-xl border border-zinc-200/80 p-2 transition hover:-translate-y-px hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
                >
                  <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => selectEmployee(e.id)}>
                    <Avatar name={e.name} color={d.color} size="sm" activity={e.activity} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{e.name}</div>
                      <div className="truncate text-xs text-zinc-500">
                        {ACTIVITY[e.activity].icon} {ACTIVITY[e.activity].label}
                      </div>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    icon="plus"
                    title={`Nova tarefa para ${e.name}`}
                    onClick={() => openNewTask(e.id)}
                    className="opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Atividade</h3>
        <EventLog events={recent} className="max-h-[42vh]" />
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: Parameters<typeof Icon>[0]['name']; tone?: 'blue' | 'red' }) {
  return (
    <div
      className={cx(
        'rounded-xl border p-3 transition',
        tone === 'red' ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : tone === 'blue' ? 'border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30' : 'border-zinc-200/80 dark:border-zinc-800',
      )}
    >
      <Icon name={icon} className={cx('mb-1 h-4 w-4', tone === 'red' ? 'text-red-600 dark:text-red-400' : tone === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400')} />
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}
