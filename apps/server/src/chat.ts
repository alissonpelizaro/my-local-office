// Conversas com um funcionário: cada mensagem vira um turno (task) que continua a mesma sessão do Claude.
// Também lista as sessões do Claude Code abertas fora do escritório no repo, para retomar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eventsOfThread } from './bus.ts';
import { all, type Employee, get, type Task } from './db.ts';
import { createTask, HttpError, isRunning, messageTask } from './office.ts';

function titleOf(text: string) {
  const line = String(text ?? '').trim().split('\n')[0];
  if (!line) throw new HttpError(400, 'mensagem vazia');
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function threads(employeeId: number) {
  const tasks = all<Task>('SELECT * FROM tasks WHERE employee_id = ? ORDER BY id', employeeId);
  return [...Map.groupBy(tasks, (t) => t.thread_id)]
    .map(([id, turns]) => {
      const root = turns[0];
      const last = turns.at(-1)!;
      return {
        id,
        title: root.title,
        origin: root.origin,
        fromEmployeeId: root.from_employee_id,
        turns: turns.length,
        status: last.status,
        running: turns.some((t) => isRunning(t.id)),
        costUsd: turns.reduce((s, t) => s + t.cost_usd, 0),
        updatedAt: last.finished_at ?? last.created_at,
        worktree: last.worktree,
        resumedSession: root.resume_session_id,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);
}

export function thread(id: number) {
  const tasks = all<Task>('SELECT * FROM tasks WHERE thread_id = ? ORDER BY id', id);
  if (!tasks.length) throw new HttpError(404, 'conversa não encontrada');
  return { id, employeeId: tasks[0].employee_id, title: tasks[0].title, tasks, events: eventsOfThread(id) };
}

export function startThread(employeeId: number, text: string, resumeSessionId?: string) {
  return createTask({ employeeId, title: titleOf(text), body: text, resumeSessionId: resumeSessionId || null });
}

// Turno rodando: a mensagem entra na hora (stdin). Senão vira um turno novo retomando a sessão.
export function sendToThread(id: number, text: string) {
  const title = titleOf(text);
  const tasks = all<Task>('SELECT * FROM tasks WHERE thread_id = ? ORDER BY id', id);
  if (!tasks.length) throw new HttpError(404, 'conversa não encontrada');
  const running = tasks.find((t) => isRunning(t.id));
  if (running) {
    messageTask(running.id, text);
    return running;
  }
  if (tasks.some((t) => t.status === 'queued' || t.status === 'pending_approval')) throw new HttpError(409, 'a conversa já tem um turno na fila');
  const base = tasks.findLast((t) => t.session_id) ?? tasks.at(-1)!;
  return createTask({ employeeId: base.employee_id, title, body: text, parentTaskId: base.id });
}

// ---------- sessões do Claude Code fora do escritório ----------

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
// Mesma regra do Claude Code: a pasta do projeto vira um nome com tudo que não é letra/número trocado por "-".
const projectDir = (cwd: string) => path.join(PROJECTS, cwd.replace(/[^a-zA-Z0-9]/g, '-'));
const OFFICE_PROMPT = /^(Task #\d+|Pergunta de |Leia o README|ok$)/;

function describeSession(file: string) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    let summary: string | null = null;
    let first: string | null = null;
    for (const line of buf.subarray(0, n).toString('utf8').split('\n')) {
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.type === 'summary' && m.summary) summary ??= m.summary;
      if (first || m.type !== 'user' || m.isMeta || m.message?.role !== 'user') continue;
      const c = m.message.content;
      const text: string | undefined = typeof c === 'string' ? c : Array.isArray(c) ? c.find((p: any) => p.type === 'text')?.text : undefined;
      if (text && !text.startsWith('<')) first = text;
    }
    return { summary, first };
  } finally {
    fs.closeSync(fd);
  }
}

export function nativeSessions(employeeId: number) {
  const e = get<Employee>('SELECT * FROM employees WHERE id = ?', employeeId);
  if (!e) throw new HttpError(404, 'funcionário não encontrado');
  const dir = projectDir(e.repo_path);
  if (!fs.existsSync(dir)) return [];
  // Sessões criadas pelo próprio escritório (tasks, consultas, onboarding) não entram.
  const known = new Set(all<{ s: string }>('SELECT session_id AS s FROM tasks WHERE session_id IS NOT NULL UNION SELECT session_id FROM usage WHERE session_id IS NOT NULL').map((r) => r.s));
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl') && !known.has(f.slice(0, -6)))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40)
    .flatMap(({ f, mtime }) => {
      const d = describeSession(path.join(dir, f));
      if (!d.first || OFFICE_PROMPT.test(d.first)) return [];
      return [{ sessionId: f.slice(0, -6), title: (d.summary ?? d.first).split('\n')[0].slice(0, 120), firstMessage: d.first.slice(0, 400), updatedAt: new Date(mtime).toISOString() }];
    });
}
