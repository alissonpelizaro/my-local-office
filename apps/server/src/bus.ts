import { EventEmitter } from 'node:events';
import { all, db } from './db.ts';

export type OfficeEvent = {
  id: number;
  ts: string;
  type: string;
  employeeId: number | null;
  taskId: number | null;
  data: unknown;
};

const emitter = new EventEmitter().setMaxListeners(0);
const insert = db.prepare('INSERT INTO events (ts, type, employee_id, task_id, data) VALUES (?, ?, ?, ?, ?)');

export function publish(type: string, data: unknown = null, ids: { employeeId?: number | null; taskId?: number | null } = {}) {
  const ts = new Date().toISOString();
  const employeeId = ids.employeeId ?? null;
  const taskId = ids.taskId ?? null;
  const { lastInsertRowid } = insert.run(ts, type, employeeId, taskId, JSON.stringify(data));
  const event: OfficeEvent = { id: Number(lastInsertRowid), ts, type, employeeId, taskId, data };
  emitter.emit('event', event);
  return event;
}

export function subscribe(fn: (e: OfficeEvent) => void) {
  emitter.on('event', fn);
  return () => void emitter.off('event', fn);
}

type Row = { id: number; ts: string; type: string; employee_id: number | null; task_id: number | null; data: string };
const toEvent = (r: Row): OfficeEvent => ({ id: r.id, ts: r.ts, type: r.type, employeeId: r.employee_id, taskId: r.task_id, data: JSON.parse(r.data) });

// Sem cursor, devolve a cauda recente para a UI montar o log ao abrir.
export const eventsAfter = (after: number | null, limit = 500) =>
  (after == null
    ? all<Row>('SELECT * FROM (SELECT * FROM events ORDER BY id DESC LIMIT ?) ORDER BY id', limit)
    : all<Row>('SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?', after, limit)
  ).map(toEvent);

// Timeline completa de uma task (inclui as consultas aos colegas), base do replay.
export const eventsOfTask = (taskId: number) => all<Row>('SELECT * FROM events WHERE task_id = ? ORDER BY id', taskId).map(toEvent);
export const eventsOfThread = (threadId: number) =>
  all<Row>('SELECT * FROM events WHERE task_id IN (SELECT id FROM tasks WHERE thread_id = ?) ORDER BY id', threadId).map(toEvent);

export type Activity = 'idle' | 'thinking' | 'reading' | 'typing' | 'running' | 'talking' | 'consulting' | 'delegating' | 'waiting' | 'onboarding';
export const activities = new Map<number, Activity>();

export function setActivity(employeeId: number, activity: Activity, detail?: string) {
  if (activities.get(employeeId) === activity && !detail) return;
  activities.set(employeeId, activity);
  publish('agent.activity', { activity, detail }, { employeeId });
}
