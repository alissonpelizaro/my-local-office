import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { countTokens, proxyMessages } from './bridge.js';
import { eventsAfter, eventsOfTask, subscribe } from './bus.ts';
import * as chat from './chat.ts';
import { access, SESSION_COOKIE } from './access.ts';
import { HOST, PORT, TOKEN } from './config.ts';
import { get, type Provider } from './db.ts';
import { discover, importRepos } from './importer.ts';
import { handleMcp } from './mcp.ts';
import { models, refreshModels } from './models.ts';
import { notificationStream, notifier, startNotifications, testNotification } from './notify.ts';
import * as office from './office.ts';
import { stopAll } from './runner.ts';
import { settings, updateSettings } from './settings.ts';
import { checkUpdate, startUpdate, updateInfo } from './update.ts';

const WEB = path.resolve(import.meta.dirname, '../../web/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body ?? { ok: true }));
}

async function readJson(req: IncomingMessage, limit = 1e6) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    if ((size += c.length) > limit) throw new office.HttpError(413, 'body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new office.HttpError(400, 'invalid JSON');
  }
}

function streamEvents(req: IncomingMessage, res: ServerResponse, url: URL) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const write = (e: { id: number }) => res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
  const cursor = req.headers['last-event-id'] ?? url.searchParams.get('after');
  for (const e of eventsAfter(cursor == null ? null : Number(cursor), 1000)) write(e);
  const off = subscribe(write);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    off();
    clearInterval(ping);
  });
}

// Build do apps/web (SPA: rota desconhecida cai no index.html).
function serveStatic(res: ServerResponse, pathname: string) {
  if (!fs.existsSync(WEB)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Web UI not built yet: run `pnpm build` and reload.');
  }
  const file = path.join(WEB, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  const target = file.startsWith(WEB) && fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? file : path.join(WEB, 'index.html');
  serveFile(res, target, target.includes(`${path.sep}assets${path.sep}`));
}

function serveFile(res: ServerResponse, file: string, immutable = false) {
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  // Arquivo some no meio de um `pnpm build`: encerra a resposta em vez de derrubar o servidor.
  fs.createReadStream(file).on('error', () => res.end()).pipe(res);
}

// Ponte para provedores OpenAI-compatíveis: o Claude Code fala Messages com /bridge/:id e a ponte traduz.
async function bridge(req: IncomingMessage, res: ServerResponse, providerId: number, countOnly: boolean) {
  const p = get<Provider>('SELECT * FROM providers WHERE id = ?', providerId);
  if (p?.format !== 'openai') return send(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'OpenAI provider not found' } });
  const body = await readJson(req, 64e6);
  if (countOnly) return send(res, 200, countTokens(body));
  await proxyMessages(body, res, { baseUrl: p.base_url, apiKey: p.api_key });
}

// Endereços para abrir de outro aparelho ou por túnel. Ligado só no loopback, os da rede não respondem (a UI explica).
function system() {
  const lan = !['127.0.0.1', '::1', 'localhost'].includes(HOST);
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i?.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  return {
    port: PORT,
    host: HOST,
    lan,
    tokenSet: TOKEN.length >= 16,
    local: `http://127.0.0.1:${PORT}`,
    network: (lan && HOST !== '0.0.0.0' ? [HOST] : ips).map((ip) => `http://${ip}:${PORT}`),
    notifier: notifier(),
    app: Boolean(process.env.MLO_APP),
  };
}

// No app desktop, sair com 75 avisa o supervisor (main.rs) que foi pedido: ele fecha o app em vez de subir de novo.
const QUIT_CODE = 75;
function quit() {
  if (!process.env.MLO_APP) throw new office.HttpError(409, 'only the desktop app can be shut down from here');
  setTimeout(() => shutdown(QUIT_CODE), 200);
}

type Handler = (body: any, params: string[], url: URL) => unknown;
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/state$/, () => ({ ...office.state(), app: updateInfo() })],
  ['PATCH', /^\/api\/settings$/, (b) => updateSettings(b)],
  ['POST', /^\/api\/departments$/, (b) => office.createDepartment(b)],
  ['PATCH', /^\/api\/departments\/(\d+)$/, (b, [id]) => office.updateDepartment(Number(id), b)],
  ['DELETE', /^\/api\/departments\/(\d+)$/, (_, [id]) => office.deleteDepartment(Number(id))],
  ['POST', /^\/api\/departments\/(\d+)\/model$/, (b, [id]) => office.setDepartmentModel(Number(id), b)],
  ['POST', /^\/api\/providers$/, (b) => office.saveProvider(b)],
  ['POST', /^\/api\/providers\/models$/, (b) => office.providerModels(b)],
  ['PATCH', /^\/api\/providers\/(\d+)$/, (b, [id]) => office.saveProvider({ ...b, id: Number(id) })],
  ['DELETE', /^\/api\/providers\/(\d+)$/, (_, [id]) => office.deleteProvider(Number(id))],
  ['GET', /^\/api\/discover$/, (_, __, url) => discover(url.searchParams.get('root') || settings().importRoot)],
  ['POST', /^\/api\/import$/, (b) => importRepos(b.items)],
  ['POST', /^\/api\/employees$/, (b) => office.createEmployee(b)],
  ['PATCH', /^\/api\/employees\/(\d+)$/, (b, [id]) => office.updateEmployee(Number(id), b)],
  ['DELETE', /^\/api\/employees\/(\d+)$/, (_, [id]) => office.deleteEmployee(Number(id))],
  ['POST', /^\/api\/employees\/(\d+)\/onboard$/, (_, [id]) => office.onboard(Number(id))],
  ['POST', /^\/api\/employees\/onboard-pending$/, () => office.onboardPending()],
  ['GET', /^\/api\/employees\/(\d+)\/threads$/, (_, [id]) => chat.threads(Number(id))],
  ['POST', /^\/api\/employees\/(\d+)\/threads$/, (b, [id]) => chat.startThread(Number(id), b.text, b.resumeSessionId)],
  ['GET', /^\/api\/employees\/(\d+)\/sessions$/, (_, [id]) => chat.nativeSessions(Number(id))],
  ['GET', /^\/api\/threads\/(\d+)$/, (_, [id]) => chat.thread(Number(id))],
  ['POST', /^\/api\/threads\/(\d+)\/messages$/, (b, [id]) => chat.sendToThread(Number(id), b.text)],
  ['GET', /^\/api\/models$/, () => models()],
  ['POST', /^\/api\/models\/refresh$/, () => refreshModels()],
  ['POST', /^\/api\/tasks$/, (b) => office.createTask({ employeeId: b.employeeId, title: b.title, body: b.body, runAt: b.runAt, repeatEvery: b.repeatEvery, precheck: b.precheck })],
  ['PATCH', /^\/api\/tasks\/(\d+)$/, (b, [id]) => office.updateTask(Number(id), { title: b.title, body: b.body, runAt: b.runAt, repeatEvery: b.repeatEvery, precheck: b.precheck })],
  ['GET', /^\/api\/tasks\/(\d+)\/events$/, (_, [id]) => eventsOfTask(Number(id))],
  ['POST', /^\/api\/tasks\/(\d+)\/message$/, (b, [id]) => office.messageTask(Number(id), b.text)],
  ['POST', /^\/api\/tasks\/(\d+)\/followup$/, (b, [id]) => office.followupTask(Number(id), b.text)],
  ['POST', /^\/api\/tasks\/(\d+)\/stop$/, (_, [id]) => office.stopTask(Number(id))],
  ['POST', /^\/api\/tasks\/(\d+)\/run$/, (_, [id]) => office.runNow(Number(id))],
  ['POST', /^\/api\/tasks\/(\d+)\/(pause|resume)$/, (_, [id, action]) => office.pauseTask(Number(id), action === 'pause')],
  ['DELETE', /^\/api\/tasks\/(\d+)\/worktree$/, (_, [id]) => office.removeTaskWorktree(Number(id))],
  ['GET', /^\/api\/costs$/, (_, __, url) => office.costs(Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30)))],
  ['POST', /^\/api\/approvals\/(\d+)$/, (b, [id]) => office.resolveApproval(Number(id), b.decision, b.text, b.answers)],
  ['POST', /^\/api\/update\/check$/, () => checkUpdate()],
  ['POST', /^\/api\/update$/, () => startUpdate()],
  ['GET', /^\/api\/system$/, () => system()],
  ['POST', /^\/api\/notify\/test$/, () => testNotification()],
  ['POST', /^\/api\/app\/quit$/, () => quit()],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { host, origin, cookie } = req.headers;
  const verdict = access({ remote: req.socket.remoteAddress, host, origin, cookie, token: url.searchParams.get('token') });
  if (verdict === 'login') {
    url.searchParams.delete('token');
    res.writeHead(302, { 'set-cookie': SESSION_COOKIE, location: url.pathname + url.search });
    return res.end();
  }
  if (verdict === 'forbidden') return send(res, 403, { error: 'origin not allowed' });
  if (verdict === 'unauthorized') return send(res, 401, { error: 'open /?token=<OFFICE_TOKEN> once on this device' });

  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/events') return streamEvents(req, res, url);
    if (req.method === 'GET' && p === '/api/notifications') return notificationStream(req, res);
    if (p === '/mcp') return req.method === 'POST' ? await handleMcp(req, res, await readJson(req, 16e6)) : send(res, 405, { error: 'use POST' });
    const b = req.method === 'POST' && p.match(/^\/bridge\/(\d+)\/v1\/messages(\/count_tokens)?$/);
    if (b) return await bridge(req, res, Number(b[1]), Boolean(b[2]));

    for (const [method, re, handler] of routes) {
      const m = req.method === method && p.match(re);
      if (m) return send(res, 200, await handler(method === 'GET' ? {} : await readJson(req), m.slice(1), url));
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    if (req.method === 'GET') return serveStatic(res, p);
    send(res, 404, { error: 'not found' });
  } catch (e: any) {
    if (!(e instanceof office.HttpError) && !e.status) console.error(e);
    if (!res.headersSent) send(res, e.status ?? 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => console.log(`my-local-office v${updateInfo().version} on http://${HOST}:${PORT}`));

startNotifications();
office.releaseScheduled();
setInterval(office.releaseScheduled, 30_000).unref();
refreshModels();
setInterval(refreshModels, 86_400_000).unref();
// Fichas desatualizadas: confere pouco depois de subir e uma vez por dia.
setTimeout(office.refreshProfiles, 30_000).unref();
setInterval(office.refreshProfiles, 86_400_000).unref();
// Release nova no GitHub: pouco depois de subir e a cada 6 h.
setTimeout(checkUpdate, 10_000).unref();
setInterval(checkUpdate, 6 * 3_600_000).unref();

// Processos `claude` filhos não sobrevivem ao server: sem o MCP dele, ficariam rodando às cegas.
function shutdown(code = 0) {
  stopAll();
  server.close();
  setTimeout(() => process.exit(code), 500).unref();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => shutdown());
// No app desktop o stdin é um pipe do app: EOF = app fechado (ou morto), o server vai junto.
if (process.env.MLO_APP) process.stdin.on('end', () => shutdown()).resume();
