import { useEffect, useMemo, useState } from 'react';
import { money, names, STATUS, time } from '../format';
import { act, api, openChat, openTask, startReplay, useOffice } from '../store';
import type { OfficeEvent, Task, TaskStatus } from '../types';
import { EventLog } from './EventLog';
import { NewTaskForm } from './NewTaskForm';
import { Button, Card, Chip, cx, Dot, Empty, Input } from './ui';

const COLUMNS: { title: string; statuses: TaskStatus[] }[] = [
  { title: 'Aguardando aprovação', statuses: ['pending_approval'] },
  { title: 'Na fila', statuses: ['queued'] },
  { title: 'Executando', statuses: ['running'] },
  { title: 'Concluídas', statuses: ['done'] },
  { title: 'Falhas e canceladas', statuses: ['failed', 'cancelled'] },
];

export function TasksTab() {
  const state = useOffice((s) => s.state);
  const selected = useOffice((s) => s.selectedTaskId);
  const name = names(state);
  const color = (employeeId: number) => state.departments.find((d) => d.id === state.employees.find((e) => e.id === employeeId)?.department_id)?.color ?? '#999';

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        <Card title="Nova task" className="mb-4 max-w-2xl">
          <NewTaskForm onCreated={(t) => openTask(t.id)} />
        </Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const tasks = state.tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <div key={col.title} className="rounded-xl bg-zinc-200/50 p-2 dark:bg-zinc-900/60">
                <h3 className="mb-2 px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  {col.title} <span className="text-zinc-400">{tasks.length}</span>
                </h3>
                <div className="grid gap-2">
                  {tasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openTask(t.id)}
                      className={cx(
                        'rounded-lg border bg-white p-2 text-left text-sm shadow-sm hover:border-blue-400 dark:bg-zinc-900',
                        selected === t.id ? 'border-blue-500' : 'border-zinc-200 dark:border-zinc-800',
                      )}
                    >
                      <div className="font-medium">
                        <span className="text-zinc-400">#{t.id}</span> {t.title}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                        <Dot color={color(t.employee_id)} /> {name(t.employee_id)}
                        {t.origin === 'agent' && <span>· de {name(t.from_employee_id)}</span>}
                        <span className="ml-auto">{money(t.cost_usd)}</span>
                      </div>
                    </button>
                  ))}
                  {tasks.length === 0 && <Empty>—</Empty>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selected != null && (
        <aside className="w-full shrink-0 overflow-y-auto border-t border-zinc-200 bg-white p-4 lg:w-[460px] lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-zinc-950">
          <TaskDetail key={selected} taskId={selected} />
        </aside>
      )}
    </div>
  );
}

function TaskDetail({ taskId }: { taskId: number }) {
  const state = useOffice((s) => s.state);
  const live = useOffice((s) => s.events);
  const [history, setHistory] = useState<OfficeEvent[]>([]);
  const [text, setText] = useState('');
  const t = state.tasks.find((x) => x.id === taskId);
  const name = names(state);

  useEffect(() => {
    api<OfficeEvent[]>('GET', `/api/tasks/${taskId}/events`).then(setHistory, () => setHistory([]));
  }, [taskId]);

  // Histórico do server + o que chegou ao vivo depois dele.
  const events = useMemo(() => {
    const last = history.at(-1)?.id ?? 0;
    return [...history, ...live.filter((e) => e.taskId === taskId && e.id > last)];
  }, [history, live, taskId]);

  if (!t) return <Empty>Task fora da lista recente.</Empty>;
  const finished = ['done', 'failed', 'cancelled'].includes(t.status);
  const parent = t.parent_task_id ? state.tasks.find((x) => x.id === t.parent_task_id) : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">
            <span className="text-zinc-400">#{t.id}</span> {t.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
            <span>{name(t.employee_id)}</span>
            <span>· {t.origin === 'agent' ? `delegada por ${name(t.from_employee_id)}` : t.origin === 'comms' ? 'via Comunicação' : 'por você'}</span>
            <span>· {time(t.created_at)}</span>
            <span>· {money(t.cost_usd)}</span>
          </div>
          {parent && (
            <button className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => openTask(parent.id)}>
              ↩ origem: #{parent.id} {parent.title}
            </button>
          )}
        </div>
        <Button variant="ghost" onClick={() => openTask(null)} aria-label="Fechar">
          ✕
        </Button>
      </div>

      {t.body && <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{t.body}</p>}

      {t.worktree && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="font-medium">🌿 Worktree isolado</div>
          <code className="mt-1 block text-xs [overflow-wrap:anywhere]">{t.worktree}</code>
          {finished && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">Revise, faça merge ou push da branch e remova. Com mudanças não commitadas o git recusa.</span>
              <Button onClick={() => navigator.clipboard?.writeText(`cd ${t.worktree}`)}>Copiar cd</Button>
              <Button variant="danger" onClick={() => act(() => api('DELETE', `/api/tasks/${t.id}/worktree`))}>
                Remover worktree
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openChat(t.employee_id, { kind: 'thread', id: t.thread_id })}>💬 Abrir conversa</Button>
        {events.length > 0 && <Button onClick={() => startReplay(t.id)}>▶️ Assistir no escritório</Button>}
        {(t.status === 'running' || t.status === 'queued' || t.status === 'pending_approval') && (
          <Button variant="danger" onClick={() => act(() => api('POST', `/api/tasks/${t.id}/stop`))}>
            {t.status === 'running' ? 'Parar' : 'Cancelar'}
          </Button>
        )}
      </div>

      {t.status === 'running' && (
        <Composer placeholder="Tocar no ombro…" label="Enviar" value={text} onChange={setText} onSubmit={() => api('POST', `/api/tasks/${t.id}/message`, { text })} />
      )}
      {finished && t.session_id && (
        <Composer
          placeholder="Continuar esta conversa (retoma a sessão)…"
          label="Continuar"
          value={text}
          onChange={setText}
          onSubmit={async () => {
            const next = await api<Task>('POST', `/api/tasks/${t.id}/followup`, { text });
            openTask(next.id);
            return next;
          }}
        />
      )}

      {t.result && (
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Resultado</h3>
          <pre className="max-h-80 overflow-auto rounded-md bg-zinc-100 p-3 font-sans text-sm whitespace-pre-wrap dark:bg-zinc-900">{t.result}</pre>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Linha do tempo</h3>
        <EventLog events={events} className="max-h-[50vh]" />
      </div>
    </div>
  );
}

function Composer(p: { placeholder: string; label: string; value: string; onChange: (v: string) => void; onSubmit: () => Promise<unknown> }) {
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!p.value.trim()) return;
        if ((await act(p.onSubmit)) !== undefined) p.onChange('');
      }}
    >
      <Input placeholder={p.placeholder} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
      <Button variant="primary">{p.label}</Button>
    </form>
  );
}
