import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITY, money, names, STATUS, time } from '../format';
import { act, api, openChat, startReplay, toast, useOffice } from '../store';
import type { Employee, OfficeEvent, Task, Thread, ThreadDetail } from '../types';
import { ApprovalCard } from './ApprovalCard';
import { Markdown } from './Markdown';
import { Button, Chip, cx } from './ui';

type Row =
  | { kind: 'user'; key: string; text: string; who: string; ts: string; live?: boolean }
  | { kind: 'agent'; key: string; text: string; ts: string }
  | { kind: 'tools'; key: string; items: OfficeEvent[] }
  | { kind: 'note'; key: string; icon: string; text: string; detail?: string }
  | { kind: 'approval'; key: string; approvalId: number; summary: string }
  | { kind: 'end'; key: string; status: string; cost: number; error?: string };

// Linha do tempo da conversa: o que você disse, o que o agente respondeu e o que ele fez no caminho.
function buildRows(events: OfficeEvent[], employeeId: number, name: (id: number | null) => string): Row[] {
  const rows: Row[] = [];
  let tools: OfficeEvent[] = [];
  const flush = () => {
    if (tools.length) rows.push({ kind: 'tools', key: `t${tools[0].id}`, items: tools });
    tools = [];
  };
  for (const e of events) {
    const d = e.data;
    const mine = e.employeeId === employeeId;
    switch (e.type) {
      case 'task.created':
        flush();
        rows.push({
          kind: 'user',
          key: `u${e.id}`,
          text: d.body || d.title,
          ts: e.ts,
          who: d.origin === 'agent' ? `${name(d.from_employee_id)} (colega)` : d.origin === 'comms' ? 'Comunicação' : 'Você',
        });
        break;
      case 'boss.message':
        flush();
        rows.push({ kind: 'user', key: `u${e.id}`, text: d.text, ts: e.ts, who: 'Você', live: true });
        break;
      case 'agent.text':
        if (!mine || d.kind !== 'task') break;
        flush();
        rows.push({ kind: 'agent', key: `a${e.id}`, text: d.text, ts: e.ts });
        break;
      case 'agent.tool':
        if (mine && d.kind === 'task') tools.push(e);
        break;
      case 'colleague.ask':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '❓', text: `Perguntou a ${d.to}`, detail: d.question });
        break;
      case 'colleague.answer':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '💬', text: `${d.from} respondeu`, detail: d.answer });
        break;
      case 'task.delegated':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: '📄', text: `Delegou a ${d.to}: ${d.title}` });
        break;
      case 'approval.requested': {
        flush();
        const p = d.payload;
        const summary = d.kind === 'tool' ? `permissão para ${p.tool}: ${p.summary}` : d.kind === 'question' ? `pergunta: ${p.question}` : `delegação: ${p.title}`;
        rows.push({ kind: 'approval', key: `p${e.id}`, approvalId: d.id, summary });
        break;
      }
      case 'approval.resolved':
        flush();
        rows.push({ kind: 'note', key: `n${e.id}`, icon: d.status === 'denied' ? '🚫' : d.status === 'expired' ? '⌛' : '👍', text: d.answer ? `Você respondeu: ${d.answer}` : `Pedido ${d.status === 'denied' ? 'negado' : d.status === 'expired' ? 'expirou' : 'aprovado'}` });
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
  const name = names(state);

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
  const { events, tasks } = useMemo(() => {
    if (!detail) return { events: [] as OfficeEvent[], tasks: [] as Task[] };
    const ids = new Set(detail.tasks.map((t) => t.id));
    for (const e of live) if (e.type === 'task.created' && e.data.thread_id === detail.id) ids.add(e.data.id);
    const last = detail.events.at(-1)?.id ?? 0;
    return {
      events: [...detail.events, ...live.filter((e) => e.id > last && e.taskId != null && ids.has(e.taskId))],
      tasks: state.tasks.filter((t) => ids.has(t.id)),
    };
  }, [detail, live, state.tasks]);

  const rows = useMemo(() => buildRows(events, employee.id, name), [events, employee.id, name]);
  const running = tasks.find((t) => t.status === 'running');
  const queued = tasks.find((t) => t.status === 'queued' || t.status === 'pending_approval');
  const cost = tasks.reduce((s, t) => s + t.cost_usd, 0);
  const pending = new Set(state.approvals.map((a) => a.id));

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [rows.length, running?.id]);

  const send = async (text: string) => {
    const task =
      target?.kind === 'thread'
        ? await act(() => api<Task>('POST', `/api/threads/${target.id}/messages`, { text }))
        : await act(() => api<Task>('POST', `/api/employees/${employee.id}/threads`, { text, resumeSessionId: target?.kind === 'native' ? target.sessionId : undefined }));
    if (task && target?.kind !== 'thread') openChat(employee.id, { kind: 'thread', id: task.thread_id });
    stick.current = true;
    return !!task;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{target?.kind === 'thread' ? (detail?.title ?? '…') : target?.kind === 'native' ? `↪ ${target.title}` : 'Nova conversa'}</div>
          {target?.kind === 'thread' && (
            <div className="text-xs text-zinc-500">
              {tasks.length} turno(s) · {money(cost)}
              {tasks.at(-1)?.worktree && ' · 🌿 worktree'}
            </div>
          )}
        </div>
        {target?.kind === 'thread' && tasks[0] && (
          <Button variant="ghost" title="Assistir o último turno no escritório" onClick={() => startReplay(tasks.at(-1)!.id)}>
            ▶️
          </Button>
        )}
        {target?.kind !== 'new' && (
          <Button variant="ghost" onClick={() => openChat(employee.id, { kind: 'new' })}>
            + Nova
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
        {target?.kind === 'new' && (
          <p className="mt-6 text-center text-sm text-zinc-500">
            Converse com <b>{employee.name}</b>. Cada mensagem continua a mesma sessão, com todo o contexto anterior.
          </p>
        )}
        <div className="grid gap-2.5">
          {rows.map((r) => (
            <RowView key={r.key} row={r} pending={pending} />
          ))}
          {(running || queued) && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
              </span>
              {running ? `${ACTIVITY[employee.activity].icon} ${ACTIVITY[employee.activity].label}…` : queued?.status === 'pending_approval' ? 'aguardando aprovação…' : 'na fila…'}
            </div>
          )}
        </div>
      </div>

      <Composer
        busy={!!running}
        disabled={!!queued && !running}
        onSend={send}
        onStop={running ? () => act(() => api('POST', `/api/tasks/${running.id}/stop`)) : undefined}
        placeholder={running ? 'Mandar agora (ele lê no meio do trabalho)…' : `Mensagem para ${employee.name}…`}
      />
    </div>
  );
}

function RowView({ row: r, pending }: { row: Row; pending: Set<number> }) {
  const approval = useOffice((s) => (r.kind === 'approval' ? s.state.approvals.find((a) => a.id === r.approvalId) : undefined));
  switch (r.kind) {
    case 'user':
      return (
        <div className="ml-8 justify-self-end">
          <div className="mb-0.5 text-right text-[11px] text-zinc-500">
            {r.who} · {time(r.ts)}
            {r.live && ' · durante o trabalho'}
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-blue-600 px-3 py-2 text-sm whitespace-pre-wrap text-white [overflow-wrap:anywhere]">{r.text}</div>
        </div>
      );
    case 'agent':
      return (
        <div className="mr-6 rounded-2xl rounded-tl-sm bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800/80">
          <Markdown text={r.text} />
        </div>
      );
    case 'tools':
      return (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">🛠️ {r.items.length} ação(ões): {[...new Set(r.items.map((i) => i.data.name.replace(/^mcp__office__/, '')))].join(', ')}</summary>
          <ul className="mt-1 grid gap-0.5 border-l border-zinc-300 pl-2 dark:border-zinc-700">
            {r.items.map((i) => (
              <li key={i.id} className="font-mono [overflow-wrap:anywhere]">
                {i.data.name.replace(/^mcp__office__/, 'office.')} <span className="text-zinc-400">{i.data.summary}</span>
              </li>
            ))}
          </ul>
        </details>
      );
    case 'note':
      return r.detail ? (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">
            {r.icon} {r.text}
          </summary>
          <p className="mt-1 border-l border-zinc-300 pl-2 whitespace-pre-wrap [overflow-wrap:anywhere] dark:border-zinc-700">{r.detail}</p>
        </details>
      ) : (
        <div className="text-xs text-zinc-500">
          {r.icon} {r.text}
        </div>
      );
    case 'approval':
      return approval && pending.has(approval.id) ? <ApprovalCard approval={approval} /> : <div className="text-xs text-zinc-500 [overflow-wrap:anywhere]">🔐 Pediu {r.summary}</div>;
    case 'end':
      return (
        <div className="grid gap-1">
          <div className={cx('flex items-center gap-2 text-[11px]', r.status === 'failed' ? 'text-red-600' : 'text-zinc-400')}>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            <Chip tone={STATUS[r.status as keyof typeof STATUS]?.tone ?? 'default'}>{STATUS[r.status as keyof typeof STATUS]?.label ?? r.status}</Chip>
            {r.cost > 0 && money(r.cost)}
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          {r.error && <p className="text-xs text-red-600 [overflow-wrap:anywhere]">{r.error.slice(0, 400)}</p>}
        </div>
      );
  }
}

function Composer(p: { busy: boolean; disabled: boolean; placeholder: string; onSend: (text: string) => Promise<boolean>; onStop?: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (!text.trim() || sending || p.disabled) return;
    setSending(true);
    if (await p.onSend(text)) setText('');
    setSending(false);
  };
  return (
    <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <textarea
        rows={Math.min(6, Math.max(2, text.split('\n').length))}
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
        className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="mt-1 flex items-center gap-2">
        <span className="flex-1 text-[11px] text-zinc-400">Enter envia · Shift+Enter quebra linha</span>
        {p.onStop && (
          <Button variant="danger" onClick={p.onStop}>
            Parar
          </Button>
        )}
        <Button variant="primary" disabled={!text.trim() || sending || p.disabled} onClick={submit}>
          {p.busy ? 'Mandar agora' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
