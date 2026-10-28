import type { Activity, OfficeEvent, OfficeState, TaskStatus } from './types';

export const ACTIVITY: Record<Activity, { label: string; icon: string }> = {
  idle: { label: 'livre', icon: '☕' },
  thinking: { label: 'pensando', icon: '💭' },
  reading: { label: 'lendo código', icon: '📖' },
  typing: { label: 'editando', icon: '⌨️' },
  running: { label: 'rodando comando', icon: '⚙️' },
  talking: { label: 'conversando', icon: '💬' },
  consulting: { label: 'atendendo colega', icon: '🔎' },
  delegating: { label: 'delegando', icon: '📄' },
  waiting: { label: 'esperando você', icon: '⏳' },
  onboarding: { label: 'onboarding', icon: '🧭' },
};

export const STATUS: Record<TaskStatus, { label: string; tone: 'default' | 'red' | 'green' | 'blue' | 'amber' }> = {
  scheduled: { label: 'agendada', tone: 'amber' },
  pending_approval: { label: 'aguardando aprovação', tone: 'amber' },
  queued: { label: 'na fila', tone: 'default' },
  running: { label: 'executando', tone: 'blue' },
  done: { label: 'concluída', tone: 'green' },
  failed: { label: 'falhou', tone: 'red' },
  cancelled: { label: 'cancelada', tone: 'default' },
};

export const money = (v: number) => `US$ ${v.toFixed(v < 1 ? 3 : 2)}`;
export const time = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function names(state: OfficeState) {
  const byId = new Map(state.employees.map((e) => [e.id, e.name]));
  return (id: number | null | undefined) => (id == null ? 'escritório' : (byId.get(id) ?? `#${id}`));
}

// Linha legível de um evento; null para os que não interessam no log.
export function describe(e: OfficeEvent): { icon: string; text: string } | null {
  const d = e.data;
  switch (e.type) {
    case 'task.created':
      return { icon: '📥', text: `nova task #${d.id}: ${d.title}` };
    case 'task.status':
      return { icon: '▶️', text: `task ${STATUS[d.status as TaskStatus]?.label ?? d.status}` };
    case 'task.finished':
      return { icon: d.status === 'done' ? '✅' : d.status === 'cancelled' ? '⛔' : '💥', text: `task ${STATUS[d.status as TaskStatus]?.label ?? d.status}${d.costUsd ? ` · ${money(d.costUsd)}` : ''}` };
    case 'run.started':
      return { icon: '🚀', text: `${d.kind === 'consult' ? 'consulta' : d.kind === 'onboard' ? 'onboarding' : 'execução'} iniciada (${d.model ?? '?'} · ${d.provider})` };
    case 'agent.text':
      return { icon: d.kind === 'consult' ? '🔎' : '💭', text: d.text };
    case 'agent.tool':
      return { icon: '🛠️', text: `${d.name.replace(/^mcp__office__/, 'office.')} ${d.summary}` };
    case 'agent.error':
      return { icon: '💥', text: d.message };
    case 'colleague.ask':
      return { icon: '❓', text: `pergunta a ${d.to}: ${d.question}` };
    case 'colleague.answer':
      return { icon: '💬', text: `${d.from} respondeu: ${d.answer}` };
    case 'task.delegated':
      return { icon: '📄', text: `delegou #${d.delegatedTaskId} a ${d.to}: ${d.title}` };
    case 'approval.requested':
      return { icon: '❗', text: `pede ${d.kind === 'tool' ? `permissão: ${d.payload.tool} ${d.payload.summary}` : d.kind === 'question' ? `resposta: ${d.payload.question}` : `delegação: ${d.payload.title}`}` };
    case 'approval.resolved':
      return { icon: d.status === 'denied' ? '🚫' : '👍', text: `aprovação ${d.status}${d.answer ? `: ${d.answer}` : ''}` };
    case 'boss.message':
      return { icon: '👔', text: `chefe: ${d.text}` };
    case 'task.worktree':
      return { icon: '🌿', text: `trabalho mantido no worktree ${d.dir}` };
    default:
      return null;
  }
}
