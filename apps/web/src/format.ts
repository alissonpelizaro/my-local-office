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

export const STATUS: Record<TaskStatus, { label: string; tone: 'default' | 'red' | 'green' | 'blue' | 'amber' | 'violet' }> = {
  scheduled: { label: 'agendada', tone: 'violet' },
  pending_approval: { label: 'aguardando aprovação', tone: 'amber' },
  queued: { label: 'na fila', tone: 'default' },
  running: { label: 'executando', tone: 'blue' },
  done: { label: 'concluída', tone: 'green' },
  failed: { label: 'falhou', tone: 'red' },
  cancelled: { label: 'cancelada', tone: 'default' },
};

export const money = (v: number) => `US$ ${v.toFixed(v < 1 ? 3 : 2)}`;
export const time = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const clock = (ts: string | number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function ago(ts: string) {
  const m = Math.round((Date.now() - Date.parse(ts)) / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 48 * 60) return `há ${Math.round(m / 60)} h`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

export function until(ts: string | number) {
  const m = Math.ceil((new Date(ts).getTime() - Date.now()) / 60_000);
  if (m <= 0) return 'agora';
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `em ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `em ${Math.round(h / 24)} dia${h >= 36 ? 's' : ''}`;
}

// "hoje 14:30", "amanhã 09:00", "sex 09:00", "03/11 09:00"
export function when(ts: string | number) {
  const d = new Date(ts);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : days > 1 && days < 7 ? d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${day} ${clock(d.getTime())}`;
}

export function everyLabel(min: number) {
  if (min % 1440 === 0) return min === 1440 ? 'todo dia' : `a cada ${min / 1440} dias`;
  if (min % 60 === 0) return min === 60 ? 'a cada hora' : `a cada ${min / 60} h`;
  return `a cada ${min} min`;
}

// dta-base → DB, monnif → MO
export function initials(name: string) {
  const parts = name.split(/[-_.\s]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// Primeira linha do texto vira o título, como no chat.
export const titleOf = (text: string) => truncate(text.trim().split('\n')[0], 80);

export const WORKING = new Set<Activity>(['thinking', 'reading', 'typing', 'running', 'talking', 'consulting', 'delegating', 'onboarding']);

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
      if (d.name === 'TodoWrite' && Array.isArray(d.todos))
        return { icon: '📋', text: `plano: ${d.todos.filter((t: { status: string }) => t.status === 'completed').length}/${d.todos.length} feito(s)` };
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
