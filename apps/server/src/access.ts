import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { publish } from './bus.ts';
import { PORT, TOKEN } from './config.ts';
import { all, get, run } from './db.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const ENV_SESSION = TOKEN.length >= 16 ? hash(TOKEN) : null;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Sessão = hash do token: revogar o token derruba os cookies dele.
// ponytail: o banco guarda esse mesmo hash; quem lê o office.db (0700, só o dono) forja a sessão. HMAC com segredo à parte se o banco sair da máquina.
const known = (session: string) => (ENV_SESSION !== null && same(session, ENV_SESSION)) || !!get('SELECT 1 FROM access_tokens WHERE hash = ?', session);
export const hasTokens = () => ENV_SESSION !== null || !!get('SELECT 1 FROM access_tokens LIMIT 1');
export const sessionCookie = (token: string) => `office_session=${hash(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`;

type Req = { remote?: string; host?: string; origin?: string; cookie?: string; token?: string | null };

// Este servidor executa agentes na máquina. Loopback: só a própria origem (barra DNS rebinding e CSRF).
// Rede (OFFICE_HOST) ou túnel/proxy no loopback com Host externo (ngrok, cloudflared): exige um token
// (Configurações → Acesso, ou OFFICE_TOKEN), que entra uma vez por `/?token=` e vira cookie SameSite=Strict. Sem token, só loopback.
export function access(r: Req): 'ok' | 'login' | 'forbidden' | 'unauthorized' {
  const origin = r.origin?.replace(/^https?:\/\//, '');
  if (LOOPBACK.has(r.remote ?? '') && LOCAL_HOSTS.has(r.host ?? '')) return !origin || LOCAL_HOSTS.has(origin) ? 'ok' : 'forbidden';
  if (!hasTokens() || (origin && origin !== r.host)) return 'forbidden';
  const session = r.cookie?.match(/(?:^|;\s*)office_session=([0-9a-f]{64})/)?.[1];
  if (session && known(session)) return 'ok';
  if (!r.token || !known(hash(r.token))) return 'unauthorized';
  run('UPDATE access_tokens SET last_used_at = ? WHERE hash = ?', new Date().toISOString(), hash(r.token));
  return 'login';
}

// ---------- tokens ----------

export const listTokens = () => all('SELECT id, name, created_at, last_used_at FROM access_tokens ORDER BY id');

export function createToken(name: unknown) {
  const label = String(name ?? '').trim().slice(0, 60);
  if (!label) throw Object.assign(new Error('name is required'), { status: 400 });
  const token = `mlo_${randomBytes(24).toString('base64url')}`;
  const { lastInsertRowid } = run('INSERT INTO access_tokens (name, hash, created_at) VALUES (?, ?, ?)', label, hash(token), new Date().toISOString());
  return { id: Number(lastInsertRowid), name: label, token };
}

export function deleteToken(id: number) {
  run('DELETE FROM access_tokens WHERE id = ?', id);
}

// ---------- túnel ----------

// Túnel pelo próprio escritório: ngrok (pede conta e `ngrok config add-authtoken`) ou cloudflared (quick tunnel, sem conta).
// O endereço público sai do log de cada um.
export const TUNNEL_TOOLS = { ngrok: ['http', `127.0.0.1:${PORT}`, '--log', 'stdout'], cloudflared: ['tunnel', '--url', `http://127.0.0.1:${PORT}`] };
type Tool = keyof typeof TUNNEL_TOOLS;
const PUBLIC_URL = /url=(https:\/\/[\w.-]+\.ngrok[\w.-]*)|(https:\/\/[\w-]+\.trycloudflare\.com)/;
let tunnel: { tool: Tool; url: string | null; error: string | null; child: ChildProcess | null } | null = null;

export const tunnelInfo = () => (tunnel ? { tool: tunnel.tool, url: tunnel.url, error: tunnel.error, running: !!tunnel.child } : null);

export function startTunnel(tool: Tool) {
  if (!(tool in TUNNEL_TOOLS)) throw Object.assign(new Error(`tool must be ${Object.keys(TUNNEL_TOOLS).join(' or ')}`), { status: 400 });
  stopTunnel();
  const child = spawn(tool, TUNNEL_TOOLS[tool], { stdio: ['ignore', 'pipe', 'pipe'] });
  const t = (tunnel = { tool, url: null as string | null, error: null as string | null, child: child as ChildProcess | null });
  let log = '';
  const read = (b: Buffer) => {
    log = (log + b).slice(-2000);
    const m = !t.url && log.match(PUBLIC_URL);
    if (m) {
      t.url = m[1] ?? m[2];
      publish('state.changed');
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('error', (e: NodeJS.ErrnoException) => {
    t.error = e.code === 'ENOENT' ? `${tool} not found in PATH` : e.message;
    t.child = null;
    publish('state.changed');
  });
  child.on('exit', (code) => {
    if (tunnel === t) t.child = null;
    if (code && !t.error) t.error = log.trim().split('\n').slice(-3).join('\n') || `${tool} exited with ${code}`;
    publish('state.changed');
  });
  return tunnelInfo();
}

export function stopTunnel() {
  tunnel?.child?.kill();
  tunnel = null;
}
