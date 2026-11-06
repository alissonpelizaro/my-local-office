import { useEffect, useRef, useState } from 'react';
import { clock, everyLabel, titleOf, when } from '../format';
import { act, api, openChat, toast, useOffice, useT } from '../store';
import type { Task } from '../types';
import { Icon } from './icons';
import { Avatar, Button, cx, Field, Input, Kbd, Rich, Segmented, Textarea } from './ui';

type Mode = 'now' | 'at' | 'repeat';

const PRESETS = [
  [5, 'm5'],
  [15, 'm15'],
  [30, 'm30'],
  [60, 'h1'],
  [240, 'h4'],
  [1440, 'd1'],
] as const;
const UNITS = [
  { value: 1, label: 'min' },
  { value: 60, label: 'hours' },
  { value: 1440, label: 'days' },
] as const;

// Valor de <input type="datetime-local"> no fuso local.
const localInput = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const roundedFuture = (min: number) => Math.ceil((Date.now() + min * 60_000) / 300_000) * 300_000;
const unitOf = (min: number) => (min % 1440 === 0 ? 1440 : min % 60 === 0 ? 60 : 1);

// Só o que ainda não começou e veio do chefe (continuações e delegações têm título e corpo separados).
export const editable = (t: Task) =>
  t.origin === 'user' && !t.parent_task_id && (t.status === 'scheduled' || t.status === 'paused' || (t.status === 'queued' && !t.repeat_every));

// Com `task`, edita a tarefa (sem trocar o funcionário).
export function NewTaskForm({ employeeId, task, onDone }: { employeeId?: number; task?: Task; onDone?: () => void }) {
  const t = useT();
  const employees = useOffice((s) => s.state.employees);
  const departments = useOffice((s) => s.state.departments);
  const [to, setTo] = useState<number | null>(employeeId ?? (employees.length === 1 ? employees[0].id : null));
  const series = task?.repeat_every;
  const [text, setText] = useState(task ? task.body || task.title : '');
  const [mode, setMode] = useState<Mode>(series ? 'repeat' : task?.status === 'scheduled' ? 'at' : 'now');
  const [at, setAt] = useState(() => localInput(task?.run_at && task.status !== 'queued' ? Date.parse(task.run_at) : roundedFuture(30)));
  const [startNow, setStartNow] = useState(!series);
  const [amount, setAmount] = useState(series ? series / unitOf(series) : 15);
  const [unit, setUnit] = useState(series ? unitOf(series) : 1);
  const [precheck, setPrecheck] = useState(task?.precheck ?? '');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (to) textRef.current?.focus();
  }, []);

  const color = (departmentId: number) => departments.find((d) => d.id === departmentId)?.color ?? '#999';
  const every = Math.max(1, Math.round(amount * unit));
  const scheduled = mode === 'at' || (mode === 'repeat' && !startNow);
  const startMs = scheduled ? new Date(at).getTime() : Date.now();
  const past = scheduled && startMs <= Date.now();
  const shown = task ? employees.filter((e) => e.id === to) : filter ? employees.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())) : employees;
  const name = employees.find((e) => e.id === to)?.name;
  const ready = !!to && !!text.trim() && !busy && !(scheduled && Number.isNaN(startMs));

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const b = {
      title: titleOf(text),
      body: text.trim(),
      runAt: scheduled ? new Date(startMs).toISOString() : undefined,
      repeatEvery: mode === 'repeat' ? every : undefined,
      precheck: mode === 'repeat' ? precheck.trim() || undefined : undefined,
    };
    const r = await act(() => (task ? api<Task>('PATCH', `/api/tasks/${task.id}`, b) : api<Task>('POST', '/api/tasks', { employeeId: to, ...b })));
    setBusy(false);
    if (!r) return;
    const what = task
      ? t.newTask.updated
      : mode === 'repeat' ? t.newTask.seriesCreated(everyLabel(every)) : scheduled && !past ? t.newTask.scheduledFor(when(startMs)) : t.newTask.sent;
    toast(`${what} · ${name}`, 'success', { label: t.tasks.openChat, run: () => openChat(r.employee_id, { kind: 'thread', id: r.thread_id }) });
    onDone?.();
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <Field group label={t.newTask.to} hint={!to && employees.length > 0 ? t.newTask.pickHint : undefined}>
        {!task && employees.length > 8 && <Input placeholder={t.newTask.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />}
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto p-0.5">
          {shown.map((e) => {
            const on = to === e.id;
            return (
              <button
                type="button"
                key={e.id}
                disabled={!!task}
                onClick={() => {
                  setTo(e.id);
                  textRef.current?.focus();
                }}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm font-medium transition active:scale-95',
                  on ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/15 dark:bg-blue-950/50 dark:text-blue-200' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600',
                )}
              >
                <Avatar name={e.name} color={color(e.department_id)} size="xs" />
                {e.name}
                {e.kind === 'intern' && <Icon name="intern" className="h-3.5 w-3.5 text-violet-500" />}
                {on && <Icon name="check" className="h-3.5 w-3.5 animate-pop" />}
              </button>
            );
          })}
          {employees.length === 0 && <span className="text-sm text-zinc-500">{t.newTask.nobody}</span>}
          {employees.length > 0 && shown.length === 0 && <span className="text-sm text-zinc-500">{t.newTask.noMatch}</span>}
        </div>
      </Field>

      <Field label={t.newTask.what} hint={text.trim() ? <Rich text={t.newTask.titlePreview(titleOf(text))} /> : t.newTask.whatHint}>
        <Textarea
          ref={textRef}
          rows={4}
          placeholder={t.newTask.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      <div className="grid gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.newTask.when}</span>
        <Segmented
          value={mode}
          onChange={setMode}
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'now', label: t.newTask.now, icon: 'zap' },
            { value: 'at', label: t.newTask.schedule, icon: 'calendar' },
            { value: 'repeat', label: t.newTask.repeat, icon: 'repeat' },
          ]}
        />

        {mode === 'at' && (
          <div key="at" className="flex animate-rise flex-wrap items-center gap-1.5">
            {[
              { label: t.newTask.in15, ms: roundedFuture(15) },
              { label: t.newTask.in1h, ms: roundedFuture(60) },
              { label: t.newTask.tomorrow9, ms: new Date(new Date().setHours(33, 0, 0, 0)).getTime() },
            ].map((q) => (
              <QuickChip key={q.label} on={at === localInput(q.ms)} onClick={() => setAt(localInput(q.ms))}>
                {q.label}
              </QuickChip>
            ))}
            <DateTime value={at} onChange={setAt} />
          </div>
        )}

        {mode === 'repeat' && (
          <div key="repeat" className="grid animate-rise gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map(([m, label]) => (
                <QuickChip
                  key={m}
                  on={every === m}
                  onClick={() => {
                    const u = unitOf(m);
                    setUnit(u);
                    setAmount(m / u);
                  }}
                >
                  {t.newTask.presets[label]}
                </QuickChip>
              ))}
              <span className="ml-1 inline-flex items-center gap-1.5 text-sm text-zinc-500">
                {t.newTask.orEvery}
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 w-16 rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm text-zinc-900 tabular-nums shadow-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(Number(e.target.value))}
                  className="h-8 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 shadow-xs outline-none focus:border-blue-500 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {t.newTask.units[u.label]}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                size="sm"
                value={startNow ? 'now' : 'at'}
                onChange={(v) => setStartNow(v === 'now')}
                options={[
                  { value: 'now', label: t.newTask.startNow },
                  { value: 'at', label: t.newTask.startAt },
                ]}
              />
              {!startNow && <DateTime value={at} onChange={setAt} />}
            </div>
            <Field label={t.newTask.precheck} hint={t.newTask.precheckHint}>
              <Input className="font-mono" placeholder={t.newTask.precheckPlaceholder} value={precheck} onChange={(e) => setPrecheck(e.target.value)} />
            </Field>
          </div>
        )}

        <Preview mode={mode} startMs={startMs} past={past} every={every} name={name} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <span className="mr-auto hidden text-xs text-zinc-400 sm:inline">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> {task ? t.newTask.saves : t.newTask.creates}
        </span>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            {t.common.cancel}
          </Button>
        )}
        <Button type="submit" variant="primary" icon={task ? 'check' : mode === 'repeat' ? 'repeat' : scheduled ? 'calendar' : 'arrowUp'} busy={busy} disabled={!ready}>
          {task ? t.common.save : mode === 'repeat' ? t.newTask.createRepeat : scheduled && !past ? t.newTask.schedule : t.newTask.startNow}
        </Button>
      </div>
    </form>
  );
}

// Frase do que vai acontecer, com os próximos horários da série.
function Preview({ mode, startMs, past, every, name }: { mode: Mode; startMs: number; past: boolean; every: number; name?: string }) {
  const t = useT();
  const who = name ?? t.newTask.theEmployee;
  const start = past ? Date.now() : startMs;
  let icon: 'zap' | 'calendar' | 'repeat' = 'zap';
  let text = t.newTask.queuedNow(who);
  let next: number[] = [];
  if (mode === 'at') {
    icon = 'calendar';
    text = past ? t.newTask.pastStartsNow : t.newTask.startsAt(when(startMs));
  } else if (mode === 'repeat') {
    icon = 'repeat';
    text = t.newTask.runs(startMs <= Date.now() + 30_000 ? t.time.now : when(startMs), everyLabel(every));
    next = [1, 2, 3].map((i) => start + i * every * 60_000);
  }
  return (
    <div key={mode} className="flex animate-fade-in gap-2.5 rounded-xl bg-zinc-900/[0.035] p-3 text-sm text-zinc-600 dark:bg-white/[0.04] dark:text-zinc-300">
      <Icon name={icon} className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
      <div className="grid gap-1.5">
        <p>
          <Rich text={text} />
        </p>
        {next.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
            {t.newTask.upcoming}
            {next.map((ms) => (
              <span key={ms} className="rounded-md bg-white px-1.5 py-0.5 font-medium tabular-nums shadow-xs dark:bg-zinc-800">
                {every >= 1440 ? when(ms) : clock(ms)}
              </span>
            ))}
            …
          </div>
        )}
        {mode === 'repeat' && every < 10 && (
          <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
            <Icon name="alert" className="h-3.5 w-3.5" /> {t.newTask.shortInterval}
          </p>
        )}
        {mode === 'repeat' && <p className="text-xs text-zinc-500">{t.newTask.seriesNote}</p>}
      </div>
    </div>
  );
}

const QuickChip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      'h-8 rounded-lg border px-2.5 text-xs font-medium transition active:scale-95',
      on ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600',
    )}
  >
    {children}
  </button>
);

const DateTime = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <input
    type="datetime-local"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-zinc-700/80 dark:bg-zinc-900 dark:[color-scheme:dark]"
  />
);
