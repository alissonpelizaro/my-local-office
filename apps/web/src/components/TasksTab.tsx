import { useEffect, useMemo, useRef, useState } from 'react';
import { everyLabel, money, names, STATUS_TONE, time, when } from '../format';
import { act, api, closeNewTask, openChat, openEditTask, openNewTask, openTask, startReplay, type TaskView, toast, useOffice, useT } from '../store';
import type { OfficeEvent, Task } from '../types';
import { EventLog } from './EventLog';
import { Icon } from './icons';
import { Markdown } from './Markdown';
import { editable, NewTaskForm } from './NewTaskForm';
import { nextScheduleHint, TaskRow } from './TaskRow';
import { Button, Chip, ConfirmButton, cx, Empty, Input, Modal, Rich, Segmented, Select, StatusIcon } from './ui';

const VIEWS: { id: TaskView; statuses: Task['status'][] }[] = [
  { id: 'active', statuses: ['running', 'queued', 'pending_approval'] },
  { id: 'planned', statuses: ['scheduled', 'paused'] },
  { id: 'history', statuses: ['done', 'failed', 'cancelled'] },
];

const viewOf = (t: Task) => VIEWS.find((v) => v.statuses.includes(t.status))!.id;

export function TasksTab() {
  const t = useT();
  const state = useOffice((s) => s.state);
  const tasks = state.tasks;
  const selected = useOffice((s) => s.selectedTaskId);
  const viewPref = useOffice((s) => s.taskView);
  const [q, setQ] = useState('');
  const [who, setWho] = useState<number | ''>('');
  // Sem pedido explícito, abre onde há algo acontecendo.
  const [view, setView] = useState<TaskView>(() => viewPref ?? (['active', 'planned', 'history'] as const).find((v) => tasks.some((x) => viewOf(x) === v)) ?? 'active');
  useEffect(() => {
    if (!viewPref) return;
    setView(viewPref);
    useOffice.setState({ taskView: null });
  }, [viewPref]);

  const name = names(state);
  const counts = { active: 0, planned: 0, history: 0 };
  const mine = who === '' ? tasks : tasks.filter((x) => x.employee_id === who);
  for (const x of mine) counts[viewOf(x)]++;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return mine.filter((x) => viewOf(x) === view && (!s || `${x.title} ${name(x.employee_id)}`.toLowerCase().includes(s)));
  }, [mine, view, q, name]);
  // Só quem aparece em alguma tarefa da lista entra no filtro.
  const people = state.employees.filter((e) => tasks.some((x) => x.employee_id === e.id));

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{t.tasks.title}</h1>
              <p className="text-sm text-zinc-500">{t.tasks.subtitle}</p>
            </div>
            <Button variant="primary" icon="plus" onClick={() => openNewTask(who === '' ? undefined : who)}>
              {t.tasks.new}
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={VIEWS.map((v) => ({ value: v.id, label: t.tasks.views[v.id], count: v.id === 'history' ? undefined : counts[v.id] }))}
            />
            <div className="ml-auto flex w-full gap-2 sm:w-auto">
              {people.length > 1 && (
                <Select value={who} onChange={(e) => setWho(e.target.value ? Number(e.target.value) : '')} className="w-auto min-w-0 flex-1 sm:w-44 sm:flex-none">
                  <option value="">{t.tasks.everyone}</option>
                  {people.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              )}
              <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
                <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
              </div>
            </div>
          </div>

          {list.length === 0 ? (
            q ? <Empty>{t.tasks.searchEmpty(q)}</Empty> : <EmptyView view={view} />
          ) : (
            <div key={view} className="grid grid-cols-1 gap-2">
              {list.map((x, i) => (
                <div key={x.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TaskRow task={x} selected={selected === x.id} />
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
  const t = useT();
  const newTask = useOffice((s) => s.newTask);
  // Mantém o conteúdo durante a animação de saída (newTask já é null nesse momento).
  const last = useRef(newTask);
  if (newTask) last.current = newTask;
  return (
    <Modal open={!!newTask} onClose={closeNewTask} className="w-[min(600px,calc(100vw-2rem))]">
      <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{last.current?.task ? t.tasks.edit : t.tasks.new}</h2>
          <Button variant="ghost" size="icon" icon="x" onClick={closeNewTask} aria-label={t.common.close} />
        </div>
        {last.current && <NewTaskForm key={JSON.stringify(last.current)} employeeId={last.current.employeeId} task={last.current.task} onDone={closeNewTask} />}
      </div>
    </Modal>
  );
}

function EmptyView({ view }: { view: TaskView }) {
  const t = useT();
  if (view === 'planned')
    return (
      <Empty
        icon="calendar"
        title={t.tasks.emptyPlanned}
        action={
          <Button variant="primary" icon="repeat" onClick={() => openNewTask()}>
            {t.tasks.scheduleOrRepeat}
          </Button>
        }
      >
        {t.tasks.emptyPlannedText}
      </Empty>
    );
  if (view === 'history')
    return (
      <Empty icon="clock" title={t.tasks.emptyHistory}>
        {t.tasks.emptyHistoryText}
      </Empty>
    );
  return (
    <Empty
      icon="sparkles"
      title={t.tasks.emptyActive}
      action={
        <Button variant="primary" icon="plus" onClick={() => openNewTask()}>
          {t.tasks.new}
        </Button>
      }
    >
      {t.tasks.emptyActiveText}
    </Empty>
  );
}

function TaskDetail({ taskId }: { taskId: number }) {
  const tt = useT();
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

  if (!t)
    return (
      <div className="p-5">
        <Empty>{tt.tasks.notInList}</Empty>
      </div>
    );
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
              <Chip tone={STATUS_TONE[t.status]}>{tt.status[t.status]}</Chip>
              <span>{name(t.employee_id)}</span>
              <span>· {t.origin === 'agent' ? tt.tasks.from(name(t.from_employee_id)) : t.origin === 'comms' ? tt.tasks.viaComms : tt.tasks.byYou}</span>
              <span>· {time(t.created_at)}</span>
              {t.cost_usd > 0 && <span>· {money(t.cost_usd)}</span>}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" icon="x" onClick={() => openTask(null)} aria-label={tt.common.close} />
      </div>

      {parent && (
        <button className="flex items-center gap-1 self-start text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => openTask(parent.id)}>
          <Icon name="arrowUp" className="h-3 w-3" /> {tt.tasks.origin(parent.id, parent.title)}
        </button>
      )}

      {hint && (
        <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900/60 dark:bg-violet-950/40">
          <Icon name={t.repeat_every ? 'repeat' : 'calendar'} className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <span className="flex-1">{t.repeat_every ? <Rich text={tt.tasks.series(everyLabel(t.repeat_every), when(t.run_at!))} /> : tt.tasks.scheduledFor(when(t.run_at!))}</span>
        </div>
      )}

      {lastRun && (
        <button
          onClick={() => openTask(lastRun.id)}
          className="grid gap-1.5 rounded-xl border border-zinc-200 p-3 text-left text-sm transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
        >
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            {tt.tasks.lastRun}
            <Chip tone={STATUS_TONE[lastRun.status]}>{tt.status[lastRun.status]}</Chip>
            {lastRun.finished_at && <span>{when(lastRun.finished_at)}</span>}
            {lastRun.cost_usd > 0 && <span className="ml-auto tabular-nums">{money(lastRun.cost_usd)}</span>}
          </span>
          {lastRun.result && <span className="line-clamp-3 text-zinc-700 dark:text-zinc-300">{lastRun.result}</span>}
        </button>
      )}

      {t.body && t.body !== t.title && <p className="rounded-xl bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{t.body}</p>}

      {t.worktree && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-center gap-1.5 font-medium">
            <Icon name="branch" className="h-4 w-4" /> {tt.tasks.worktree}
          </div>
          <code className="mt-1 block text-xs break-all">{t.worktree}</code>
          {finished && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{tt.tasks.worktreeHint}</span>
              <Button size="sm" icon="copy" onClick={() => navigator.clipboard?.writeText(`cd ${t.worktree}`)}>
                {tt.tasks.copyCd}
              </Button>
              <ConfirmButton size="sm" icon="trash" confirm={tt.tasks.removeConfirm} onConfirm={() => act(() => api('DELETE', `/api/tasks/${t.id}/worktree`))}>
                {tt.common.remove}
              </ConfirmButton>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Agendada: a ação principal é rodar já; a conversa fica secundária. */}
        {(t.status === 'scheduled' || t.status === 'paused') && <RunNowButton task={t} />}
        <Button variant={t.status === 'scheduled' || t.status === 'paused' ? undefined : 'primary'} icon="message" onClick={() => openChat(t.employee_id, { kind: 'thread', id: t.thread_id })}>
          {t.repeat_every ? tt.tasks.viewRuns : tt.tasks.openChat}
        </Button>
        {ran && events.length > 0 && (
          <Button icon="play" onClick={() => startReplay(t.id)}>
            {tt.tasks.watch}
          </Button>
        )}
        {editable(t) && (
          <Button icon="pencil" onClick={() => openEditTask(t)}>
            {tt.common.edit}
          </Button>
        )}
        {t.repeat_every && (t.status === 'scheduled' || t.status === 'paused') && <PauseButton task={t} />}
        {(t.status === 'running' || t.status === 'scheduled' || t.status === 'paused' || t.status === 'queued' || t.status === 'pending_approval') && (
          <ConfirmButton
            icon={t.status === 'running' ? 'stop' : 'x'}
            confirm={t.repeat_every ? tt.tasks.endSeriesQ : tt.common.confirmQ}
            onConfirm={() => act(() => api('POST', `/api/tasks/${t.id}/stop`))}
          >
            {t.status === 'running' ? tt.tasks.stop : t.repeat_every ? tt.tasks.endSeries : tt.common.cancel}
          </ConfirmButton>
        )}
      </div>

      {t.status === 'running' && <Composer placeholder={tt.tasks.nudge} value={text} onChange={setText} onSubmit={() => api('POST', `/api/tasks/${t.id}/message`, { text })} />}
      {finished && t.session_id && (
        <Composer
          placeholder={tt.tasks.continuePlaceholder}
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
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{tt.tasks.result}</h3>
          <div className={cx('max-h-96 overflow-auto rounded-xl p-3.5 text-sm leading-relaxed', t.status === 'failed' ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200' : 'bg-zinc-50 dark:bg-zinc-900')}>
            <Markdown text={t.result} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{tt.tasks.timeline}</h3>
        <EventLog events={events} className="max-h-[50vh]" />
      </div>
    </div>
  );
}

// Roda a agendada já: avulsa sai da agenda; série ganha uma execução extra e mantém o próximo horário.
export function RunNowButton({ task, compact }: { task: Task; compact?: boolean }) {
  const t = useT();
  const state = useOffice((s) => s.state);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={compact ? 'ghost' : 'primary'}
      size={compact ? 'sm' : undefined}
      icon="zap"
      busy={busy}
      title={task.repeat_every ? t.tasks.runNowSeriesHint : t.tasks.runNowHint}
      onClick={async () => {
        setBusy(true);
        const queued = await act(() => api<Task>('POST', `/api/tasks/${task.id}/run`));
        setBusy(false);
        if (!queued) return;
        const busyNow = state.tasks.some((x) => x.employee_id === task.employee_id && x.status === 'running');
        toast(busyNow ? t.tasks.runNowQueued(names(state)(task.employee_id)) : t.tasks.runNowStarted, 'success', { label: t.tasks.watchIt, run: () => openTask(queued.id) });
      }}
    >
      {t.tasks.runNow}
    </Button>
  );
}

export function PauseButton({ task, compact }: { task: Task; compact?: boolean }) {
  const t = useT();
  const paused = task.status === 'paused';
  return (
    <Button
      variant={compact ? 'ghost' : undefined}
      size={compact ? 'sm' : undefined}
      icon={paused ? 'play' : 'pause'}
      onClick={() => act(() => api('POST', `/api/tasks/${task.id}/${paused ? 'resume' : 'pause'}`))}
    >
      {compact ? (paused ? t.tasks.resume : t.tasks.pause) : paused ? t.tasks.resumeSeries : t.tasks.pauseSeries}
    </Button>
  );
}

function Composer(p: { placeholder: string; value: string; onChange: (v: string) => void; onSubmit: () => Promise<unknown> }) {
  const t = useT();
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
      <Button type="submit" variant="primary" icon="arrowRight" aria-label={t.common.send} />
    </form>
  );
}
