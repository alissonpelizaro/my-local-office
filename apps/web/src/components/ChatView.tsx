import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITY, clock, everyLabel, money, names, STATUS, time, when } from '../format';
import { act, api, openChat, startReplay, toast, useOffice } from '../store';
import type { Approval, Employee, OfficeEvent, Task, Thread, ThreadDetail } from '../types';
import { ApprovalCard, QuestionCard } from './ApprovalCard';
import { Icon } from './icons';
import { Markdown } from './Markdown';
import { PauseButton } from './TasksTab';
import { Button, Chip, cx, Skeleton, Spinner } from './ui';

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string };
type Row =
  | { kind: 'user'; key: string; text: string; who: string; ts: string; note?: string }
  | { kind: 'agent'; key: string; text: string }
  | { kind: 'tools'; key: string; items: OfficeEvent[] }
  | { kind: 'todos'; key: string; todos: Todo[] }
  | { kind: 'note'; key: string; icon: string; text: string; detail?: string; tone?: 'warn' }
  | { kind: 'question'; key: string; approvalId: number; text: string }
  | { kind: 'approval'; key: string; approvalId: number }
  | { kind: 'end'; key: string; status: string; cost: number; error?: string }
  | { kind: 'run'; key: string; ts: string };

// O que o agente fez entre uma fala e outra, em linguagem natural.
const ACTIONS: [RegExp, string, string, string][] = [
  [/^Read$/, '📖', '1 leitura', '# leituras'],
  [/^(Grep|Glob)$/, '🔍', '1 busca', '# buscas'],
  [/^Bash$/, '⚙️', '1 comando', '# comandos'],
  [/^(Edit|MultiEdit|Write|NotebookEdit)$/, '✏️', '1 edição', '# edições'],
  [/^(WebFetch|WebSearch)$/, '🌐', '1 consulta na web', '# consultas na web'],
  [/^(Task|Agent)$/, '🤖', '1 subagente', '# subagentes'],
  [/^mcp__office__/, '🤝', '1 ação no escritório', '# ações no escritório'],
  [/.*/, '🔧', '1 ferramenta', '# ferramentas'],
];
const actionOf = (name: string) => ACTIONS.find(([re]) => re.test(name))!;
const HIDDEN_TOOLS = new Set(['AskUserQuestion', 'TodoWrite', 'mcp__office__ask_boss']);

function summarizeTools(items: OfficeEvent[]) {
  const counts = new Map<(typeof ACTIONS)[number], number>();
  for (const i of items) {
    const a = actionOf(i.data.name);
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts].map(([[, icon, one, many], n]) => `${icon} ${n === 1 ? one : many.replace('#', String(n))}`).join(' · ');
}

// Linha do tempo da conversa: o que você disse, o que o agente respondeu e o que ele fez no caminho.
function buildRows(events: OfficeEvent[], employeeId: number, name: (id: number | null) => string): Row[] {
  const rows: Row[] = [];
  let tools: OfficeEvent[] = [];
  let todosAt = -1; // um checklist por turno, sempre o mais recente
  // Série: o pedido aparece uma vez; as execuções seguintes viram divisores quando começam de fato
  // (a próxima é criada antes de a atual rodar, então ancorar no task.created embaralharia a ordem).
  let seriesShown = false;
  const runs = new Set<number>();
  const flush = () => {
    if (tools.length) rows.push({ kind: 'tools', key: `t${tools[0].id}`, items: tools });
    tools = [];
  };
  for (const e of events) {
    const d = e.data;
    const mine = e.employeeId === employeeId;
    switch (e.type) {
      case 'task.created':
        if (d.repeat_every && seriesShown) {
          runs.add(d.id);
          break;
        }
        flush();
        todosAt = -1;
        seriesShown ||= !!d.repeat_every;
        rows.push({
          kind: 'user',
          key: `u${e.id}`,
          text: d.body || d.title,
          ts: e.ts,
          who: d.origin === 'agent' ? `${name(d.from_employee_id)} (colega)` : d.origin === 'comms' ? 'Comunicação' : 'Você',
          note: d.repeat_every ? `🔁 ${everyLabel(d.repeat_every)}` : undefined,
        });
        break;
      case 'task.status':
        if (d.status !== 'running' || !runs.delete(e.taskId!)) break;
        flush();
        todosAt = -1;
        rows.push({ kind: 'run', key: `r${e.id}`, ts: e.ts });
        break;
      case 'task.updated':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '✏️', text: 'Você editou o pedido', detail: d.body || d.title });
        break;
      case 'boss.message':
        flush();
        rows.push({ kind: 'user', key: `u${e.id}`, text: d.text, ts: e.ts, who: 'Você', note: 'durante o trabalho' });
        break;
      case 'agent.text':
        if (!mine || d.kind !== 'task') break;
        flush();
        rows.push({ kind: 'agent', key: `a${e.id}`, text: d.text });
        break;
      case 'agent.tool':
        if (!mine || d.kind !== 'task') break;
        if (d.name === 'TodoWrite' && d.todos) {
          flush();
          const row: Row = { kind: 'todos', key: `d${e.id}`, todos: d.todos };
          if (todosAt >= 0) rows.splice(todosAt, 1);
          todosAt = rows.push(row) - 1;
        } else if (!HIDDEN_TOOLS.has(d.name)) {
          tools.push(e);
        }
        break;
      case 'agent.compact':
        if (!mine || d.kind !== 'task') break;
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '🗜️', text: `Conversa compactada${d.preTokens ? ` (tinha ${Math.round(d.preTokens / 1000)}K tokens)` : ''}` });
        break;
      case 'colleague.ask':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '🤝', text: `Perguntou a ${d.to}`, detail: d.question });
        break;
      case 'colleague.answer':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '💬', text: `${d.from} respondeu`, detail: d.answer });
        break;
      case 'task.delegated':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '📄', text: `Delegou a ${d.to}: ${d.title}` });
        break;
      case 'approval.requested':
        flush();
        if (d.kind === 'question') rows.push({ kind: 'question', key: `q${e.id}`, approvalId: d.id, text: d.payload.question });
        else rows.push({ kind: 'approval', key: `p${e.id}`, approvalId: d.id });
        break;
      case 'approval.resolved':
        flush();
        if (d.kind === 'question' && d.status === 'answered') rows.push({ kind: 'user', key: `u${e.id}`, text: d.answer, ts: e.ts, who: 'Você' });
        else if (d.kind === 'question') rows.push({ kind: 'note', key: `n${e.id}`, icon: '💬', text: d.status === 'expired' ? 'A pergunta expirou' : 'Você preferiu responder pela conversa' });
        else if (d.status === 'denied') rows.push({ kind: 'note', key: `n${e.id}`, icon: '🚫', text: d.answer ? `Você negou: ${d.answer}` : 'Você negou', tone: 'warn' });
        else if (d.status === 'expired') rows.push({ kind: 'note', key: `n${e.id}`, icon: '⌛', text: 'Pedido expirou' });
        break;
      case 'task.worktree':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '🌿', text: 'Trabalho mantido num worktree isolado', detail: d.dir });
        break;
      case 'task.finished':
        flush();
        rows.push({ kind: 'end', key: `e${e.id}`, status: d.status, cost: d.costUsd ?? 0, error: d.status === 'failed' ? d.result : undefined });
        break;
    }
  }
  flush();
  return rows;
}

export function ChatView({ employee }: { employee: Employee }) {
  const target = useOffice((s) => s.chat[employee.id]);
  const state = useOffice((s) => s.state);
  const live = useOffice((s) => s.events);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const threadId = target?.kind === 'thread' ? target.id : null;
  const name = useMemo(() => names(state), [state]);

  // Sem conversa escolhida, abre a mais recente (ou uma nova).
  useEffect(() => {
    if (target) return;
    api<Thread[]>('GET', `/api/employees/${employee.id}/threads`).then(
      (list) => openChat(employee.id, list[0] ? { kind: 'thread', id: list[0].id } : { kind: 'new' }),
      () => openChat(employee.id, { kind: 'new' }),
    );
  }, [target, employee.id]);

  useEffect(() => {
    setDetail(null);
    if (threadId) api<ThreadDetail>('GET', `/api/threads/${threadId}`).then(setDetail, (e) => toast(e.message));
  }, [threadId]);

  // Histórico do server + eventos ao vivo dos turnos desta conversa (inclusive turnos criados depois).
  const { events, tasks, current } = useMemo(() => {
    if (!detail) return { events: [] as OfficeEvent[], tasks: [] as Task[], current: [] as Task[] };
    const ids = new Set(detail.tasks.map((t) => t.id));
    for (const e of live) if (e.type === 'task.created' && e.data.thread_id === detail.id) ids.add(e.data.id);
    const last = detail.events.at(-1)?.id ?? 0;
    // Situação (rodando, fila, série) só do estado ao vivo; o histórico da conversa completa contagem e custo,
    // já que o estado guarda só a última execução encerrada de cada série.
    const current = state.tasks.filter((t) => ids.has(t.id));
    const fresh = new Map(current.map((t) => [t.id, t]));
    const old = new Map(detail.tasks.map((t) => [t.id, t]));
    return {
      events: [...detail.events, ...live.filter((e) => e.id > last && e.taskId != null && ids.has(e.taskId))],
      tasks: [...ids].sort((a, b) => a - b).flatMap((id) => fresh.get(id) ?? old.get(id) ?? []),
      current,
    };
  }, [detail, live, state.tasks]);

  const rows = useMemo(() => buildRows(events, employee.id, name), [events, employee.id, name]);
  const series = current.find((t) => (t.status === 'scheduled' || t.status === 'paused') && t.repeat_every);
  const running = current.find((t) => t.status === 'running');
  const queued = current.find((t) => t.status === 'scheduled' || t.status === 'queued' || t.status === 'pending_approval');
  const cost = tasks.reduce((s, t) => s + t.cost_usd, 0);
  const taskIds = new Set(tasks.map((t) => t.id));
  const waiting = state.approvals.filter((a) => a.task_id != null && taskIds.has(a.task_id));
  const question = waiting.find((a): a is Extract<Approval, { kind: 'question' }> => a.kind === 'question');

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  useEffect(() => setOptimistic(null), [rows.length]);
  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [rows.length, running?.id, waiting.length, optimistic]);

  // Linhas que já existiam ao abrir a conversa entram sem animação; só as novas deslizam.
  const seen = useRef<{ thread: number; keys: Set<string> } | null>(null);
  if (detail && seen.current?.thread !== detail.id) seen.current = { thread: detail.id, keys: new Set(rows.map((r) => r.key)) };
  const lastRun = tasks.findLast((t) => t.status !== 'scheduled' && t.status !== 'paused' && t.status !== 'queued');

  const send = async (text: string) => {
    stick.current = true;
    if (!question) setOptimistic(text);
    const ok = await deliver(text);
    if (!ok) setOptimistic(null);
    return ok;
  };
  const deliver = async (text: string) => {
    // Pergunta pendente: o que você escreve vira a resposta dela.
    if (question) {
      const q = question.payload.questions?.[0]?.question;
      const body = q ? { decision: 'answer', answers: { [q]: text } } : { decision: 'answer', text };
      return (await act(() => api('POST', `/api/approvals/${question.id}`, body))) !== undefined;
    }
    const task =
      target?.kind === 'thread'
        ? await act(() => api<Task>('POST', `/api/threads/${target.id}/messages`, { text }))
        : await act(() => api<Task>('POST', `/api/employees/${employee.id}/threads`, { text, resumeSessionId: target?.kind === 'native' ? target.sessionId : undefined }));
    if (task && target?.kind !== 'thread') openChat(employee.id, { kind: 'thread', id: task.thread_id });
    return !!task;
  };

  const status = question
    ? '❓ esperando sua resposta'
    : waiting.length
      ? '🔐 esperando sua permissão'
      : running
        ? `${ACTIVITY[employee.activity].icon} ${ACTIVITY[employee.activity].label}…`
        : queued?.status === 'scheduled'
          ? `${queued.repeat_every ? `série ${everyLabel(queued.repeat_every)} · próxima` : 'agendada'} ${when(queued.run_at!)}`
          : queued?.status === 'pending_approval'
          ? 'aguardando aprovação da delegação…'
          : queued
            ? 'na fila…'
            : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{target?.kind === 'thread' ? (detail?.title ?? '…') : target?.kind === 'native' ? `↪ ${target.title}` : 'Nova conversa'}</span>
            {series && (
              <Chip tone={series.status === 'paused' ? 'amber' : 'violet'} icon={series.status === 'paused' ? 'pause' : 'repeat'}>
                {everyLabel(series.repeat_every!)}
              </Chip>
            )}
          </div>
          {target?.kind === 'thread' && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span>{tasks.length} turno(s) · {money(cost)}</span>
              {tasks.at(-1)?.worktree && <Icon name="branch" className="h-3 w-3" />}
            </div>
          )}
        </div>
        {series && <PauseButton task={series} compact />}
        {target?.kind === 'thread' && lastRun && (
          <Button variant="ghost" size="icon" icon="play" title="Assistir o último turno no escritório" onClick={() => startReplay(lastRun.id)} />
        )}
        {target?.kind !== 'new' && (
          <Button variant="ghost" size="sm" icon="plus" onClick={() => openChat(employee.id, { kind: 'new' })}>
            Nova
          </Button>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={(ev) => {
          const el = ev.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-3"
      >
        {target?.kind === 'native' && (
          <p className="mb-3 rounded-lg bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
            Continuando uma sessão do Claude Code aberta fora do escritório. {employee.name} trabalha numa cópia dela: a sessão original não é alterada.
          </p>
        )}
        {target?.kind === 'new' && !optimistic && (
          <div className="mt-8 grid animate-fade-in justify-items-center gap-2 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <Icon name="message" className="h-6 w-6" />
            </div>
            <p className="max-w-xs text-sm text-zinc-500">
              Converse com <b className="text-zinc-800 dark:text-zinc-200">{employee.name}</b>. Cada mensagem continua a mesma sessão, com todo o contexto anterior.
            </p>
          </div>
        )}
        {target?.kind === 'thread' && !detail && !optimistic && (
          <div className="grid gap-3">
            <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
            <Skeleton className="h-20 w-5/6 rounded-2xl" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        )}
        {series && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-violet-50 p-2 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
            <Icon name="repeat" className="h-3.5 w-3.5" /> Série {everyLabel(series.repeat_every!)} ·{' '}
            {series.status === 'paused' ? 'pausada' : `próxima ${when(series.run_at!)}`}. Cada execução aparece como um turno abaixo.
          </p>
        )}
        {detail && detail.hiddenTurns > 0 && (
          <p className="mb-3 text-center text-xs text-zinc-400">+{detail.hiddenTurns} turno(s) anteriores ocultos</p>
        )}
        <div className="grid gap-3">
          {rows.map((r) => (
            <div key={r.key} className={cx('grid', !seen.current?.keys.has(r.key) && 'animate-rise')}>
              <RowView row={r} />
            </div>
          ))}
          {optimistic && (
            <div className="ml-10 animate-rise justify-self-end opacity-70">
              <div className="rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white [overflow-wrap:anywhere]">{optimistic}</div>
            </div>
          )}
          {status && (
            <div key={status} className="flex animate-fade-in items-center gap-2 text-xs text-zinc-500">
              {!waiting.length && (running || queued?.status === 'queued') && (
                <span className="inline-flex gap-1 rounded-full bg-zinc-100 px-2.5 py-2 dark:bg-zinc-800">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bob rounded-full bg-zinc-500" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              )}
              {status}
            </div>
          )}
        </div>
      </div>

      <Composer
        key={employee.id}
        draftKey={employee.id}
        busy={!!running && !question}
        disabled={!!queued && queued.status !== 'scheduled' && !running}
        onSend={send}
        onStop={running ? () => act(() => api('POST', `/api/tasks/${running.id}/stop`)) : undefined}
        placeholder={
          question ? 'Responda à pergunta acima, ou escreva sua resposta aqui…' : running ? 'Mandar agora (ele lê no meio do trabalho)…' : `Mensagem para ${employee.name}…`
        }
      />
    </div>
  );
}

function RowView({ row: r }: { row: Row }) {
  const pending = useOffice((s) => ('approvalId' in r ? s.state.approvals.find((a) => a.id === r.approvalId) : undefined));
  switch (r.kind) {
    case 'user':
      return (
        <div className="ml-10 justify-self-end">
          <div className="mb-1 text-right text-[11px] text-zinc-400">
            {r.who} · {time(r.ts)}
            {r.note && ` · ${r.note}`}
          </div>
          <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-blue-500 to-blue-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white shadow-sm shadow-blue-600/20 [overflow-wrap:anywhere]">
            {r.text}
          </div>
        </div>
      );
    case 'agent':
      return (
        <div className="mr-6 rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2.5 text-sm leading-relaxed dark:bg-zinc-800/70">
          <Markdown text={r.text} />
        </div>
      );
    case 'question':
      return pending?.kind === 'question' ? (
        <div className="mr-4">
          <QuestionCard id={pending.id} who={null} payload={pending.payload} />
        </div>
      ) : (
        <div className="mr-6 rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-sm whitespace-pre-wrap dark:bg-zinc-800/70">❓ {r.text}</div>
      );
    case 'approval':
      return pending ? <ApprovalCard approval={pending} compact /> : null;
    case 'tools':
      return (
        <details className="group text-xs text-zinc-500">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-2 py-1 transition select-none hover:bg-zinc-100 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" className="h-3 w-3 transition-transform duration-200 group-open:rotate-90" />
            {summarizeTools(r.items)}
          </summary>
          <ul className="mt-1 ml-3 grid animate-fade-in gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
            {r.items.map((i) => (
              <li key={i.id} className="[overflow-wrap:anywhere]">
                {actionOf(i.data.name)[1]} {i.data.description && <span className="text-zinc-600 dark:text-zinc-300">{i.data.description} </span>}
                <span className="font-mono text-zinc-400">
                  {i.data.name.startsWith('mcp__office__') ? i.data.name.slice(12) : i.data.name === 'Bash' ? '' : `${i.data.name} `}
                  {i.data.summary}
                </span>
              </li>
            ))}
          </ul>
        </details>
      );
    case 'todos': {
      const done = r.todos.filter((t) => t.status === 'completed').length;
      return (
        <div className="mr-6 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Icon name="list" className="h-3.5 w-3.5" /> Plano
            <span className="ml-auto tabular-nums">
              {done}/{r.todos.length}
            </span>
          </div>
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full origin-left rounded-full bg-emerald-500 transition-transform duration-500 ease-[var(--ease-out-expo)]" style={{ transform: `scaleX(${done / Math.max(1, r.todos.length)})` }} />
          </div>
          <ul className="grid gap-1">
            {r.todos.map((t, i) => (
              <li key={i} className={cx('flex items-start gap-2', t.status === 'completed' && 'text-zinc-400 line-through', t.status === 'in_progress' && 'font-medium')}>
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
                  {t.status === 'completed' ? (
                    <Icon name="check" className="h-3.5 w-3.5 text-emerald-500" />
                  ) : t.status === 'in_progress' ? (
                    <Spinner className="h-3.5 w-3.5 text-blue-500" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full border border-zinc-300 dark:border-zinc-600" />
                  )}
                </span>
                {t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'note':
      return r.detail ? (
        <details className={cx('group text-xs', r.tone === 'warn' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-2 py-1 transition select-none hover:bg-zinc-100 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" className="h-3 w-3 transition-transform duration-200 group-open:rotate-90" />
            {r.icon} {r.text}
          </summary>
          <p className="mt-1 ml-3 animate-fade-in border-l border-zinc-200 pl-3 whitespace-pre-wrap [overflow-wrap:anywhere] dark:border-zinc-800">{r.detail}</p>
        </details>
      ) : (
        <div className={cx('px-2 text-xs', r.tone === 'warn' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>
          {r.icon} {r.text}
        </div>
      );
    case 'run':
      return (
        <div className="flex items-center gap-2 pt-2 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          <span className="h-px flex-1 bg-violet-200 dark:bg-violet-900/60" />
          <Icon name="repeat" className="h-3 w-3" /> Execução das {clock(r.ts)}
          <span className="h-px flex-1 bg-violet-200 dark:bg-violet-900/60" />
        </div>
      );
    case 'end':
      return (
        <div className="grid gap-1">
          <div className={cx('flex items-center gap-2 text-[11px]', r.status === 'failed' ? 'text-red-600' : 'text-zinc-400')}>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            <Chip tone={STATUS[r.status as keyof typeof STATUS]?.tone ?? 'default'}>{STATUS[r.status as keyof typeof STATUS]?.label ?? r.status}</Chip>
            {r.cost > 0 && money(r.cost)}
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          {r.error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 [overflow-wrap:anywhere] dark:bg-red-950/40 dark:text-red-300">{r.error.slice(0, 400)}</p>}
        </div>
      );
  }
}

// Rascunho por funcionário: trocar de aba ou de pessoa não perde o que estava escrito.
const drafts = new Map<number, string>();

function Composer(p: { draftKey: number; busy: boolean; disabled: boolean; placeholder: string; onSend: (text: string) => Promise<boolean>; onStop?: () => void }) {
  const [text, setTextState] = useState(() => drafts.get(p.draftKey) ?? '');
  const setText = (v: string) => {
    drafts.set(p.draftKey, v);
    setTextState(v);
  };
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (!text.trim() || sending || p.disabled) return;
    setSending(true);
    if (await p.onSend(text)) setText('');
    setSending(false);
  };
  return (
    <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15 dark:border-zinc-700/80 dark:bg-zinc-900">
        <textarea
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          value={text}
          disabled={p.disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={p.disabled ? 'Aguardando o turno na fila…' : p.placeholder}
          className="max-h-40 w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className="flex-1 pl-1 text-[11px] text-zinc-400">
            <b className="font-medium">Enter</b> envia · <b className="font-medium">Shift+Enter</b> quebra linha
          </span>
          {p.onStop && (
            <Button variant="danger" size="sm" icon="stop" onClick={p.onStop}>
              Parar
            </Button>
          )}
          <Button variant="primary" size="sm" icon={p.busy ? 'zap' : 'arrowUp'} busy={sending} disabled={!text.trim() || p.disabled} onClick={submit}>
            {p.busy ? 'Mandar agora' : 'Enviar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
