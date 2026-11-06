// Notificações do sistema (macOS) para o que precisa de você mesmo com a UI fechada.
import { execFile } from 'node:child_process';
import { type OfficeEvent, subscribe } from './bus.ts';
import { type Employee, get } from './db.ts';
import { msg } from './i18n.ts';
import { settings } from './settings.ts';

// Os textos vão por argv: conteúdo vindo dos agentes nunca é interpolado no AppleScript.
const SCRIPT = ['on run argv', 'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name "Glass"', 'end run'];

function notify(title: string, subtitle: string, message: string) {
  if (process.platform !== 'darwin') return;
  execFile('osascript', [...SCRIPT.flatMap((l) => ['-e', l]), title, subtitle, message.replace(/\s+/g, ' ').slice(0, 220)], () => {});
}

function describe(e: OfficeEvent): [string, string] | null {
  const s = settings();
  const m = msg();
  const who = e.employeeId ? (get<Employee>('SELECT * FROM employees WHERE id = ?', e.employeeId)?.name ?? m.office) : m.office;
  const d = e.data as any;
  if (e.type === 'approval.requested' && s.notifyApprovals) {
    const p = d.payload;
    if (d.kind === 'tool') return [m.asksPermission(who, p.external), `${p.tool}: ${p.summary}`];
    if (d.kind === 'question') return [m.hasQuestion(who), p.question];
    return [m.wantsToDelegate(p.from, p.to), p.title];
  }
  // Série recorrente só incomoda quando falha.
  const repeating = () => !!get<{ r: number | null }>('SELECT repeat_every AS r FROM tasks WHERE id = ?', e.taskId)?.r;
  if (e.type === 'task.finished' && s.notifyTaskFinished && d.status !== 'cancelled' && !(d.status === 'done' && repeating())) {
    return [m.taskFinished(who, e.taskId!, d.status), d.result ?? ''];
  }
  return null;
}

export function startNotifications() {
  subscribe((e) => {
    const n = describe(e);
    if (n) notify('My Local Office', n[0], n[1]);
  });
}
