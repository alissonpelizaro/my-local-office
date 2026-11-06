import type { IconName } from './components/icons';
import { tr } from './store';
import type { Activity, OfficeEvent, OfficeState, TaskStatus } from './types';

export const ACTIVITY_ICON: Record<Activity, IconName> = {
  idle: 'coffee',
  thinking: 'brain',
  reading: 'book',
  typing: 'keyboard',
  running: 'terminal',
  talking: 'messages',
  consulting: 'search',
  delegating: 'file',
  waiting: 'hourglass',
  onboarding: 'compass',
};

export const STATUS_TONE: Record<TaskStatus, 'default' | 'red' | 'green' | 'blue' | 'amber' | 'violet'> = {
  scheduled: 'violet',
  paused: 'amber',
  pending_approval: 'amber',
  queued: 'default',
  running: 'blue',
  done: 'green',
  failed: 'red',
  cancelled: 'default',
};
export const statusLabel = (s: string) => tr().status[s as TaskStatus] ?? s;

const loc = () => tr().locale;
export const money = (v: number) => `US$ ${v.toFixed(v < 1 ? 3 : 2)}`;
export const time = (ts: string) => new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const clock = (ts: string | number) => new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
export const shortDate = (ts: string | number, opts: Intl.DateTimeFormatOptions) => new Date(ts).toLocaleDateString(loc(), opts).replace('.', '');
export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function ago(ts: string) {
  const t = tr().time;
  const m = Math.round((Date.now() - Date.parse(ts)) / 60_000);
  if (m < 1) return t.now;
  if (m < 60) return t.agoMin(m);
  if (m < 48 * 60) return t.agoH(Math.round(m / 60));
  return new Date(ts).toLocaleDateString(loc());
}

export function until(ts: string | number) {
  const t = tr().time;
  const m = Math.ceil((new Date(ts).getTime() - Date.now()) / 60_000);
  if (m <= 0) return t.now;
  if (m < 60) return t.inMin(m);
  const h = Math.floor(m / 60);
  if (h < 24) return t.inH(h, m % 60);
  return t.inDays(Math.round(h / 24));
}

// "today 14:30", "tomorrow 09:00", "Fri 09:00", "11/03 09:00"
export function when(ts: string | number) {
  const t = tr().time;
  const d = new Date(ts);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days === 0 ? t.today : days === 1 ? t.tomorrow : days > 1 && days < 7 ? shortDate(d.getTime(), { weekday: 'short' }) : shortDate(d.getTime(), { day: '2-digit', month: '2-digit' });
  return `${day} ${clock(d.getTime())}`;
}

export function everyLabel(min: number) {
  const t = tr().time;
  if (min % 1440 === 0) return min === 1440 ? t.everyDay : t.everyDays(min / 1440);
  if (min % 60 === 0) return min === 60 ? t.everyHour : t.everyHours(min / 60);
  return t.everyMin(min);
}

// api-gateway → AG, billing → BI
export function initials(name: string) {
  const parts = name.split(/[-_.\s]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// Primeira linha do texto vira o título, como no chat.
export const titleOf = (text: string) => truncate(text.trim().split('\n')[0], 80);

export const WORKING = new Set<Activity>(['thinking', 'reading', 'typing', 'running', 'talking', 'consulting', 'delegating', 'onboarding']);

export function names(state: OfficeState) {
  const byId = new Map(state.employees.map((e) => [e.id, e.name]));
  return (id: number | null | undefined) => (id == null ? tr().common.office : (byId.get(id) ?? `#${id}`));
}

const finishIcon = (status: string): IconName => (status === 'done' ? 'circleCheck' : status === 'cancelled' ? 'ban' : 'circleX');

// Linha legível de um evento; null para os que não interessam no log.
export function describe(e: OfficeEvent): { icon: IconName; text: string; tone?: 'red' | 'green' } | null {
  const d = e.data;
  const t = tr().events;
  switch (e.type) {
    case 'task.created':
      return { icon: 'inbox', text: t.taskCreated(d.id, d.title) };
    case 'task.updated':
      return { icon: 'pencil', text: t.taskEdited(d.title) };
    case 'task.status':
      return { icon: d.status === 'paused' ? 'pause' : 'play', text: t.task(statusLabel(d.status)) };
    case 'task.finished':
      return { icon: finishIcon(d.status), tone: d.status === 'done' ? 'green' : d.status === 'failed' ? 'red' : undefined, text: `${t.task(statusLabel(d.status))}${d.costUsd ? ` · ${money(d.costUsd)}` : ''}` };
    case 'run.started':
      return { icon: 'rocket', text: t.runStarted(t.runKind[d.kind] ?? d.kind, d.model ?? '?', !d.provider || d.provider === 'nativo' ? tr().common.native : d.provider) };
    case 'agent.text':
      return { icon: d.kind === 'consult' ? 'search' : 'brain', text: d.text };
    case 'agent.tool':
      if (d.name === 'TodoWrite' && Array.isArray(d.todos)) return { icon: 'clipboard', text: t.plan(d.todos.filter((x: { status: string }) => x.status === 'completed').length, d.todos.length) };
      return { icon: 'wrench', text: `${d.name.replace(/^mcp__office__/, 'office.')} ${d.summary}` };
    case 'agent.error':
      return { icon: 'circleX', tone: 'red', text: d.message };
    case 'agent.compact':
      return { icon: 'shrink', text: t.compacted(d.preTokens ? Math.round(d.preTokens / 1000) : 0) };
    case 'colleague.ask':
      return { icon: 'question', text: t.asks(d.to, d.question) };
    case 'colleague.answer':
      return { icon: 'message', text: t.answered(d.from, d.answer) };
    case 'task.delegated':
      return { icon: 'file', text: t.delegated(d.delegatedTaskId, d.to, d.title) };
    case 'approval.requested':
      return {
        icon: 'alert',
        text: d.kind === 'tool' ? t.asksPermission(d.payload.tool, d.payload.summary) : d.kind === 'question' ? t.asksAnswer(d.payload.question) : t.asksDelegation(d.payload.title),
      };
    case 'approval.resolved':
      return { icon: d.status === 'denied' ? 'ban' : 'thumbsUp', text: t.resolved(t.approval[d.status] ?? d.status, d.answer) };
    case 'boss.message':
      return { icon: 'briefcase', text: t.boss(d.text) };
    case 'task.worktree':
      return { icon: 'branch', text: t.worktreeKept(d.dir) };
    default:
      return null;
  }
}
