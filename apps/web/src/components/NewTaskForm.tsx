import { useEffect, useRef, useState } from 'react';
import { clock, everyLabel, titleOf, when } from '../format';
import { act, api, openChat, useOffice, toast } from '../store';
import type { Task } from '../types';
import { Icon } from './icons';
import { Avatar, Button, cx, Field, Input, Kbd, Segmented, Textarea } from './ui';

type Mode = 'now' | 'at' | 'repeat';

const PRESETS: [number, string][] = [
  [5, '5 min'],
  [15, '15 min'],
  [30, '30 min'],
  [60, '1 h'],
  [240, '4 h'],
  [1440, '1 dia'],
];
const UNITS = [
  { value: 1, label: 'min' },
  { value: 60, label: 'horas' },
  { value: 1440, label: 'dias' },
];

// Valor de <input type="datetime-local"> no fuso local.
const localInput = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const roundedFuture = (min: number) => Math.ceil((Date.now() + min * 60_000) / 300_000) * 300_000;
const unitOf = (min: number) => (min % 1440 === 0 ? 1440 : min % 60 === 0 ? 60 : 1);

// Só o que ainda não começou e veio do chefe (continuações e delegações têm título e corpo separados).
export const editable = (t: Task) =>
  t.origin === 'user' && !t.parent_task_id && (t.status === 'scheduled' || t.status === 'paused' || (t.status === 'queued' && !t.repeat_every));

// Com `task`, edita a tarefa (sem trocar o funcionário).
export function NewTaskForm({ employeeId, task, onDone }: { employeeId?: number; task?: Task; onDone?: () => void }) {
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
    const t = await act(() => (task ? api<Task>('PATCH', `/api/tasks/${task.id}`, b) : api<Task>('POST', '/api/tasks', { employeeId: to, ...b })));
    setBusy(false);
    if (!t) return;
    const what = task
      ? 'Tarefa atualizada'
      : mode === 'repeat' ? `Série criada: ${everyLabel(every)}` : scheduled && !past ? `Agendada para ${when(startMs)}` : 'Tarefa enviada';
    toast(`${what} · ${name}`, 'success', { label: 'Abrir conversa', run: () => openChat(t.employee_id, { kind: 'thread', id: t.thread_id }) });
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
      <Field group label="Para quem" hint={!to && employees.length > 0 ? 'Escolha quem vai fazer.' : undefined}>
        {!task && employees.length > 8 && <Input placeholder="Filtrar funcionários…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
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
                {on && <Icon name="check" className="h-3.5 w-3.5 animate-pop" />}
              </button>
            );
          })}
          {employees.length === 0 && <span className="text-sm text-zinc-500">Ninguém contratado ainda. Importe repositórios em Config.</span>}
          {employees.length > 0 && shown.length === 0 && <span className="text-sm text-zinc-500">Ninguém com esse nome.</span>}
        </div>
      </Field>

      <Field label="O que fazer" hint={text.trim() ? <>Título: <b className="font-medium text-zinc-600 dark:text-zinc-300">{titleOf(text)}</b></> : 'A primeira linha vira o título; o resto é contexto e critério de pronto.'}>
        <Textarea
          ref={textRef}
          rows={4}
          placeholder={'Ex.: Verificar PRs abertos e avisar se algum quebrou o build\nOlhe só os do último dia.'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      <div className="grid gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Quando</span>
        <Segmented
          value={mode}
          onChange={setMode}
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'now', label: 'Agora', icon: 'zap' },
            { value: 'at', label: 'Agendar', icon: 'calendar' },
            { value: 'repeat', label: 'Repetir', icon: 'repeat' },
          ]}
        />

        {mode === 'at' && (
          <div key="at" className="flex animate-rise flex-wrap items-center gap-1.5">
            {[
              { label: 'Em 15 min', ms: roundedFuture(15) },
              { label: 'Em 1 h', ms: roundedFuture(60) },
              { label: 'Amanhã 9h', ms: new Date(new Date().setHours(33, 0, 0, 0)).getTime() },
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
                  {label}
                </QuickChip>
              ))}
              <span className="ml-1 inline-flex items-center gap-1.5 text-sm text-zinc-500">
                ou a cada
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
                      {u.label}
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
                  { value: 'now', label: 'Começar agora' },
                  { value: 'at', label: 'Começar em…' },
                ]}
              />
              {!startNow && <DateTime value={at} onChange={setAt} />}
            </div>
            <Field label="Pré-checagem (opcional)" hint="Comando de shell no repo antes de cada execução. Sem saída, encerra sem chamar o agente; com saída, ela vai no prompt.">
              <Input className="font-mono" placeholder="Ex.: ~/.local/bin/pr-pendencias" value={precheck} onChange={(e) => setPrecheck(e.target.value)} />
            </Field>
          </div>
        )}

        <Preview mode={mode} startMs={startMs} past={past} every={every} name={name} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <span className="mr-auto hidden text-xs text-zinc-400 sm:inline">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> {task ? 'salva' : 'cria'}
        </span>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" icon={task ? 'check' : mode === 'repeat' ? 'repeat' : scheduled ? 'calendar' : 'arrowUp'} busy={busy} disabled={!ready}>
          {task ? 'Salvar' : mode === 'repeat' ? 'Criar repetição' : scheduled && !past ? 'Agendar' : 'Começar agora'}
        </Button>
      </div>
    </form>
  );
}

// Frase do que vai acontecer, com os próximos horários da série.
function Preview({ mode, startMs, past, every, name }: { mode: Mode; startMs: number; past: boolean; every: number; name?: string }) {
  const who = name ?? 'o funcionário';
  const start = past ? Date.now() : startMs;
  let icon: 'zap' | 'calendar' | 'repeat' = 'zap';
  let text: React.ReactNode = <>Entra na fila agora e começa assim que {who} estiver livre.</>;
  let next: number[] = [];
  if (mode === 'at') {
    icon = 'calendar';
    text = past ? <>Esse horário já passou: começa agora.</> : <>Começa {when(startMs)}.</>;
  } else if (mode === 'repeat') {
    icon = 'repeat';
    text = (
      <>
        Roda {startMs <= Date.now() + 30_000 ? 'agora' : when(startMs)} e depois <b className="font-semibold">{everyLabel(every)}</b>, até você encerrar.
      </>
    );
    next = [1, 2, 3].map((i) => start + i * every * 60_000);
  }
  return (
    <div key={mode} className="flex animate-fade-in gap-2.5 rounded-xl bg-zinc-900/[0.035] p-3 text-sm text-zinc-600 dark:bg-white/[0.04] dark:text-zinc-300">
      <Icon name={icon} className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
      <div className="grid gap-1.5">
        <p>{text}</p>
        {next.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
            Próximas:
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
            <Icon name="alert" className="h-3.5 w-3.5" /> Intervalo curto: cada execução consome o limite da assinatura.
          </p>
        )}
        {mode === 'repeat' && <p className="text-xs text-zinc-500">Só avisa no macOS se uma execução falhar. Se a anterior ainda estiver na fila, o horário é pulado.</p>}
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
