import { useMemo } from 'react';
import { ACTIVITY } from '../format';
import { OfficeCanvas, officeView } from '../office/OfficeCanvas';
import { selectEmployee, setTab, stopReplay, useOffice } from '../store';
import { ApprovalCard } from './ApprovalCard';
import { EmployeePanel } from './EmployeePanel';
import { EventLog } from './EventLog';
import { Button, Card, Dot } from './ui';

export function OfficeTab() {
  const loaded = useOffice((s) => s.loaded);
  const empty = useOffice((s) => s.state.departments.length === 0);
  const replay = useOffice((s) => s.replay);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="relative min-h-[55vh] flex-1 overflow-hidden">
        <OfficeCanvas onBoss={() => selectEmployee(null)} />
        {replay && (
          <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900/90 px-4 py-1.5 text-sm text-white shadow-lg">
            <span>
              ▶️ Replay da task #{replay.taskId} · {replay.index}/{replay.total}
            </span>
            <button className="rounded-full bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25" onClick={stopReplay}>
              Parar
            </button>
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex gap-2">
          <Button onClick={() => officeView.fit()} title="Arrastar move, roda do mouse dá zoom">
            ⤢ Centralizar
          </Button>
        </div>
        {loaded && empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
            <Card className="pointer-events-auto max-w-sm text-center">
              <p className="mb-3 text-sm">O escritório ainda não tem departamentos. Importe seus repositórios para contratar os funcionários.</p>
              <Button variant="primary" onClick={() => setTab('config')}>
                Importar repositórios
              </Button>
            </Card>
          </div>
        )}
      </div>
      <aside className="flex h-[70vh] w-full shrink-0 flex-col border-t border-zinc-200 bg-white p-4 lg:h-auto lg:w-[460px] lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-zinc-950">
        <SidePanel />
      </aside>
    </div>
  );
}

function SidePanel() {
  const selected = useOffice((s) => s.selectedEmployeeId);
  const approvals = useOffice((s) => s.state.approvals);
  // O painel do funcionário já mostra os pedidos dele.
  const others = approvals.filter((a) => selected == null || a.employee_id !== selected || a.kind === 'delegation');

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {others.length > 0 && (
        <div className="grid max-h-[40%] shrink-0 gap-2 overflow-y-auto">
          <h3 className="text-xs font-semibold tracking-wide text-red-600 uppercase dark:text-red-400">Pedidos para você ({others.length})</h3>
          {others.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>
      )}
      <div className={selected != null ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto"}>{selected != null ? <EmployeePanel employeeId={selected} /> : <Overview />}</div>
    </div>
  );
}

function Overview() {
  const { departments, employees, tasks } = useOffice((s) => s.state);
  const events = useOffice((s) => s.events);
  const recent = useMemo(() => events.slice(-150), [events]);
  const running = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="grid gap-4">
      <div className="text-sm text-zinc-500">
        {employees.length} funcionário(s) · {running} task(s) em execução. Clique em alguém no escritório para ver o trabalho e delegar.
      </div>
      {departments.map((d) => (
        <div key={d.id}>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Dot color={d.color} /> {d.name}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {employees
              .filter((e) => e.department_id === d.id)
              .map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEmployee(e.id)}
                  className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs hover:border-blue-400 dark:border-zinc-700"
                  title={ACTIVITY[e.activity].label}
                >
                  {ACTIVITY[e.activity].icon} {e.name}
                </button>
              ))}
          </div>
        </div>
      ))}
      <div>
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Atividade</h3>
        <EventLog events={recent} className="max-h-[45vh]" />
      </div>
    </div>
  );
}
