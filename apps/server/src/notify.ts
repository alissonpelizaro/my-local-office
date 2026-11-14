// Notificações do sistema para o que precisa de você mesmo com a UI fechada.
// Com o app desktop aberto, ele assina /api/notifications e mostra a notificação nativa (com o ícone do app, o clique
// abre a janela) e toca o som. Sem ele: macOS (osascript + afplay) e Linux (notify-send + som do tema).
import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type OfficeEvent, subscribe } from './bus.ts';
import { all, type Employee, get } from './db.ts';
import { msg } from './i18n.ts';
import { settings } from './settings.ts';

type Note = { title: string; body: string; urgent: boolean };
const apps = new Set<ServerResponse>();
const write = (res: ServerResponse, data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

export const notifier = () => (apps.size ? 'app' : process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'none');

// O app recebe também o idioma (rótulos da bandeja), de novo sempre que ele muda.
let lang = '';
export function notificationStream(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  write(res, { lang: settings().language, pending: pending() });
  apps.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    apps.delete(res);
    clearInterval(ping);
  });
}

const pending = () => get<{ n: number }>(`SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'`)?.n ?? 0;

// Os textos vão por argv: conteúdo vindo dos agentes nunca é interpolado no AppleScript.
const SCRIPT = ['on run argv', 'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)', 'end run'];
const LINUX_SOUND = '/usr/share/sounds/freedesktop/stereo/message-new-instant.oga';
const report = (what: string) => (err: Error | null) => err && console.error(`notification (${what}): ${err.message}`);

function deliver(n: Note) {
  const body = n.body.replace(/\s+/g, ' ').slice(0, 220);
  const sound = settings().notifySound;
  if (apps.size) {
    for (const res of apps) write(res, { title: n.title, body, sound, pending: pending() });
    return;
  }
  if (process.platform === 'darwin') {
    execFile('osascript', [...SCRIPT.flatMap((l) => ['-e', l]), 'My Local Office', n.title, body], report('osascript'));
    // O som da própria notificação some quando o macOS silencia o Script Editor: toca à parte.
    if (sound) execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], report('afplay'));
  } else if (process.platform === 'linux') {
    execFile('notify-send', ['-a', 'My Local Office', '-u', n.urgent ? 'critical' : 'normal', n.title, body], report('notify-send'));
    if (sound) execFile('canberra-gtk-play', ['-i', 'message-new-instant'], (err) => err && execFile('paplay', [LINUX_SOUND], () => {}));
  }
}

function describe(e: OfficeEvent): Note | null {
  const s = settings();
  const m = msg();
  const who = e.employeeId ? (get<Employee>('SELECT * FROM employees WHERE id = ?', e.employeeId)?.name ?? m.office) : m.office;
  const d = e.data as any;
  if (e.type === 'approval.requested' && s.notifyApprovals) {
    const p = d.payload;
    if (d.kind === 'tool') return { title: m.asksPermission(who, p.external), body: `${p.tool}: ${p.summary}`, urgent: true };
    if (d.kind === 'question') return { title: m.hasQuestion(who), body: p.question, urgent: true };
    return { title: m.wantsToDelegate(p.from, p.to), body: p.title, urgent: true };
  }
  // Série recorrente só incomoda quando falha.
  const repeating = () => !!get<{ r: number | null }>('SELECT repeat_every AS r FROM tasks WHERE id = ?', e.taskId)?.r;
  if (e.type === 'task.finished' && s.notifyTaskFinished && d.status !== 'cancelled' && !(d.status === 'done' && repeating())) {
    return { title: m.taskFinished(who, e.taskId!, d.status), body: d.result ?? '', urgent: false };
  }
  return null;
}

export function testNotification() {
  deliver({ title: msg().testTitle, body: msg().testBody, urgent: false });
  return { via: notifier() };
}

// Pedido esquecido: um lembrete quando passa de 10 min sem resposta (uma vez por pedido).
const REMIND_MS = 10 * 60_000;
const reminded = new Set<number>();
function remind() {
  if (!settings().notifyApprovals) return;
  const old = all<{ id: number; created_at: string }>(`SELECT id, created_at FROM approvals WHERE status = 'pending'`).filter(
    (a) => !reminded.has(a.id) && Date.now() - Date.parse(a.created_at) > REMIND_MS,
  );
  if (!old.length) return;
  for (const a of old) reminded.add(a.id);
  deliver({ title: msg().stillWaiting(pending()), body: '', urgent: true });
}

export function startNotifications() {
  subscribe((e) => {
    const n = describe(e);
    if (n) deliver(n);
    // Contador da bandeja/Dock do app e o idioma dos rótulos.
    if (apps.size && (e.type === 'approval.resolved' || e.type === 'state.changed')) {
      const now = settings().language;
      for (const res of apps) write(res, now !== lang ? { lang: now, pending: pending() } : { pending: pending() });
      lang = now;
    }
  });
  setInterval(remind, 60_000).unref();
}
