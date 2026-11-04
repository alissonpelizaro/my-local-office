import { useEffect, useMemo, useRef, useState } from 'react';
import { everyLabel, money, names, STATUS, time, when } from '../format';
import { act, api, closeNewTask, openChat, openEditTask, openNewTask, openTask, startReplay, useOffice, type TaskView } from '../store';
import type { OfficeEvent, Task } from '../types';
import { EventLog } from './EventLog';
import { Icon } from './icons';
import { Markdown } from './Markdown';
import { editable, NewTaskForm } from './NewTaskForm';
import { nextScheduleHint, TaskRow } from './TaskRow';
import { Button, Chip, ConfirmButton, cx, Empty, Input, Modal, Segmented, StatusIcon } from './ui';

const VIEWS: { id: TaskView; label: string; statuses: Task['status'][] }[] = [
  { id: 'active', label: 'Ativas', statuses: ['running', 'queued', 'pending_approval'] },
  { id: 'planned', label: 'Planejadas', statuses: ['scheduled', 'paused'] },
  { id: 'history', label: 'Histórico', statuses: ['done', 'failed', 'cancelled'] },
];

const viewOf = (t: Task) => VIEWS.find((v) => v.statuses.includes(t.status))!.id;

export function TasksTab() {
  const state = useOffice((s) => s.state);
  const tasks = state.tasks;
  const selected = useOffice((s) => s.selectedTaskId);
  const viewPref = useOffice((s) => s.taskView);
  const [q, setQ] = useState('');
  // Sem pedido explícito, abre onde há algo acontecendo.
  const [view, setView] = useState<TaskView>(() => viewPref ?? (['active', 'planned', 'history'] as const).find((v) => tasks.some((t) => viewOf(t) === v)) ?? 'active');
  useEffect(() => {
    if (!viewPref) return;
    setView(viewPref);
    useOffice.setState({ taskView: null });
  }, [viewPref]);

  const name = names(state);
  const counts = { active: 0, planned: 0, history: 0 };
  for (const t of tasks) counts[viewOf(t)]++;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter((t) => viewOf(t) === view && (!s || `${t.title} ${name(t.employee_id)}`.toLowerCase().includes(s)));
  }, [tasks, view, q, name]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Tarefas</h1>
              <p className="text-sm text-zinc-500">Tudo que a equipe está fazendo, vai fazer ou já fez.</p>
            </div>
            <Button variant="primary" icon="plus" onClick={() => openNewTask()}>
              Nova tarefa
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={VIEWS.map((v) => ({ value: v.id, label: v.label, count: v.id === 'history' ? undefined : counts[v.id] }))}
            />
            <div className="relative ml-auto w-full sm:w-56">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
          </div>

          {list.length === 0 ? (
            q ? <Empty>Nada com “{q}” aqui.</Empty> : <EmptyView view={view} />
          ) : (
            <div key={view} className="grid gap-2">
              {list.map((t, i) => (
                <div key={t.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TaskRow task={t} selected={selected === t.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected != null && (
        <aside className="w-full shrink-0 animate-slide-in overflow-y-auto border-t border-zinc-200 bg-white lg:w-[480px] lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-zinc-950">
          <TaskDetail key={selected} taskId={selected} />
        </aside>
      )}
    </div>
  );
}

export function NewTaskModal() {
  const newTask = useOffice((s) => s.newTask);
  // Mantém o conteúdo durante a animação de saída (newTask já é null nesse momento).
  const last = useRef(newTask);
  if (newTask) last.current = newTask;
  return (
    <Modal open={!!newTask} onClose={closeNewTask} className="w-[min(600px,calc(100vw-2rem))]">
      <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{last.current?.task ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <Button variant="ghost" size="icon" icon="x" onClick={closeNewTask} aria-label="Fechar" />
        </div>
        {last.current && <NewTaskForm key={JSON.stringify(last.current)} employeeId={last.current.employeeId} task={last.current.task} onDone={closeNewTask} />}
      </div>
    </Modal>
  );
}

function EmptyView({ view }: { view: TaskView }) {
  if (view === 'planned')
    return (
      <Empty icon="📅" title="Nada planejado" action={<Button variant="primary" icon="repeat" onClick={() => openNewTask()}>Agendar ou repetir</Button>}>
        Agende uma tarefa para mais tarde ou crie uma série que roda sozinha (ex.: a cada 15 min).
      </Empty>
    );
  if (view === 'history')
    return <Empty icon="📜" title="Sem histórico">Tarefas concluídas, canceladas ou com falha aparecem aqui.</Empty>;
  return (
    <Empty icon="✨" title="Tudo tranquilo" action={<Button variant="primary" icon="plus" onClick={() => openNewTask()}>Nova tarefa</Button>}>
      Nenhuma tarefa ativa. Crie uma e acompanhe pelo escritório.
    </Empty>
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

  const events = useMemo(() => {
    const last = history.at(-1)?.id ?? 0;
    return [...history, ...live.filter((e) => e.taskId === taskId && e.id > last)];
  }, [history, live, taskId]);

  if (!t) return <div className="p-5"><Empty>Tarefa fora da lista recente.</Empty></div>;
  const finished = ['done', 'failed', 'cancelled'].includes(t.status);
  const parent = t.parent_task_id ? state.tasks.find((x) => x.id === t.parent_task_id) : undefined;
  const hint = nextScheduleHint(t);
  // Série: o que interessa é como foi a última execução (o estado vem em ordem decrescente de id).
  const lastRun = t.repeat_every ? state.tasks.find((x) => x.thread_id === t.thread_id && x.id !== t.id && ['done', 'failed'].includes(x.status)) : undefined;
  const ran = !['scheduled', 'paused', 'queued', 'pending_approval'].includes(t.status);

  return (
    <div className="grid gap-5 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <StatusIcon status={t.status} repeat={!!t.repeat_every} />
          <div className="min-w-0">
            <div className="text-base leading-tight font-semibold">{t.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
              <span>{name(t.employee_id)}</span>
              <span>· {t.origin === 'agent' ? `de ${name(t.from_employee_id)}` : t.origin === 'comms' ? 'via Comunicação' : 'por você'}</span>
              <span>· {time(t.created_at)}</span>
              {t.cost_usd > 0 && <span>· {money(t.cost_usd)}</span>}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" icon="x" onClick={() => openTask(null)} aria-label="Fechar" />
      </div>

      {parent && (
        <button className="flex items-center gap-1 self-start text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => openTask(parent.id)}>
          <Icon name="arrowUp" className="h-3 w-3" /> origem: #{parent.id} {parent.title}
        </button>
      )}

      {hint && (
        <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900/60 dark:bg-violet-950/40">
          <Icon name={t.repeat_every ? 'repeat' : 'calendar'} className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <span className="flex-1">{t.repeat_every ? <>Série <b>{everyLabel(t.repeat_every)}</b> · próxima {when(t.run_at!)}</> : <>Agendada para {when(t.run_at!)}</>}</span>
        </div>
      )}

      {lastRun && (
        <button
          onClick={() => openTask(lastRun.id)}
          className="grid gap-1.5 rounded-xl border border-zinc-200 p-3 text-left text-sm transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
        >
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            Última execução
            <Chip tone={STATUS[lastRun.status].tone}>{STATUS[lastRun.status].label}</Chip>
            {lastRun.finished_at && <span>{when(lastRun.finished_at)}</span>}
            {lastRun.cost_usd > 0 && <span className="ml-auto tabular-nums">{money(lastRun.cost_usd)}</span>}
          </span>
          {lastRun.result && <span className="line-clamp-3 text-zinc-700 dark:text-zinc-300">{lastRun.result}</span>}
        </button>
      )}

      {t.body && t.body !== t.title && <p className="rounded-xl bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{t.body}</p>}

      {t.worktree && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-center gap-1.5 font-medium"><Icon name="branch" className="h-4 w-4" /> Worktree isolado</div>
          <code className="mt-1 block text-xs break-all">{t.worktree}</code>
          {finished && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">Revise, faça merge/push e remova. Com mudanças não commitadas o git recusa.</span>
              <Button size="sm" icon="copy" onClick={() => navigator.clipboard?.writeText(`cd ${t.worktree}`)}>Copiar cd</Button>
              <ConfirmButton size="sm" icon="trash" confirm="Remover mesmo?" onConfirm={() => act(() => api('DELETE', `/api/tasks/${t.id}/worktree`))}>Remover</ConfirmButton>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="message" onClick={() => openChat(t.employee_id, { kind: 'thread', id: t.thread_id })}>
          {t.repeat_every ? 'Ver execuções' : 'Abrir conversa'}
        </Button>
        {ran && events.length > 0 && <Button icon="play" onClick={() => startReplay(t.id)}>Assistir</Button>}
        {editable(t) && <Button icon="pencil" onClick={() => openEditTask(t)}>Editar</Button>}
        {t.repeat_every && (t.status === 'scheduled' || t.status === 'paused') && <PauseButton task={t} />}
        {(t.status === 'running' || t.status === 'scheduled' || t.status === 'paused' || t.status === 'queued' || t.status === 'pending_approval') && (
          <ConfirmButton
            icon={t.status === 'running' ? 'stop' : 'x'}
            confirm={t.repeat_every ? 'Encerrar série?' : 'Confirmar?'}
            onConfirm={() => act(() => api('POST', `/api/tasks/${t.id}/stop`))}
          >
            {t.status === 'running' ? 'Parar' : t.repeat_every ? 'Encerrar série' : 'Cancelar'}
          </ConfirmButton>
        )}
      </div>

      {t.status === 'running' && <Composer placeholder="Tocar no ombro…" value={text} onChange={setText} onSubmit={() => api('POST', `/api/tasks/${t.id}/message`, { text })} />}
      {finished && t.session_id && (
        <Composer
          placeholder="Continuar esta conversa (retoma a sessão)…"
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
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Resultado</h3>
          <div className={cx('max-h-96 overflow-auto rounded-xl p-3.5 text-sm leading-relaxed', t.status === 'failed' ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200' : 'bg-zinc-50 dark:bg-zinc-900')}>
            <Markdown text={t.result} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Linha do tempo</h3>
        <EventLog events={events} className="max-h-[50vh]" />
      </div>
    </div>
  );
}

export function PauseButton({ task, compact }: { task: Task; compact?: boolean }) {
  const paused = task.status === 'paused';
  return (
    <Button
      variant={compact ? 'ghost' : undefined}
      size={compact ? 'sm' : undefined}
      icon={paused ? 'play' : 'pause'}
      onClick={() => act(() => api('POST', `/api/tasks/${task.id}/${paused ? 'resume' : 'pause'}`))}
    >
      {paused ? 'Retomar' : 'Pausar'}
      {!compact && ' série'}
    </Button>
  );
}

function Composer(p: { placeholder: string; value: string; onChange: (v: string) => void; onSubmit: () => Promise<unknown> }) {
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
      <Button type="submit" variant="primary" icon="arrowRight" aria-label="Enviar" />
    </form>
  );
}
