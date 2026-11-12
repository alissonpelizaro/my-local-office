import { createHash, timingSafeEqual } from 'node:crypto';
import { HOST, PORT, TOKEN } from './config.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const LAN = !LOOPBACK.has(HOST) && HOST !== 'localhost';
if (LAN && TOKEN.length < 16) throw new Error('OFFICE_HOST fora do loopback exige OFFICE_TOKEN com 16+ caracteres');

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const SESSION = hash(TOKEN);
const valid = (s = '') => s.length === SESSION.length && timingSafeEqual(Buffer.from(s), Buffer.from(SESSION));
export const SESSION_COOKIE = `office_session=${SESSION}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`;

type Req = { remote?: string; host?: string; origin?: string; cookie?: string; token?: string | null };

// Este servidor executa agentes na máquina. Loopback: só a própria origem (barra DNS rebinding e CSRF).
// Rede (OFFICE_HOST) ou túnel/proxy no loopback com Host externo (ngrok, cloudflared): exige o token,
// que entra uma vez por `/?token=` e vira cookie SameSite=Strict. Sem token configurado, só loopback.
export function access(r: Req): 'ok' | 'login' | 'forbidden' | 'unauthorized' {
  const origin = r.origin?.replace(/^https?:\/\//, '');
  if (LOOPBACK.has(r.remote ?? '') && LOCAL_HOSTS.has(r.host ?? '')) return !origin || LOCAL_HOSTS.has(origin) ? 'ok' : 'forbidden';
  if (TOKEN.length < 16 || (origin && origin !== r.host)) return 'forbidden';
  if (valid(r.cookie?.match(/(?:^|;\s*)office_session=([0-9a-f]+)/)?.[1])) return 'ok';
  return r.token && valid(hash(r.token)) ? 'login' : 'unauthorized';
}
