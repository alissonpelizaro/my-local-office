// Versão instalada, checagem de release nova no GitHub e atualização com um clique.
// A atualização roda o install.sh da própria versão (copiado para fora da pasta que ele substitui), desacoplado do
// server: ele baixa o pacote, troca o app (ou a pasta do serviço headless), tira a quarentena do macOS e o reabre/reinicia.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publish } from './bus.ts';
import { DATA } from './db.ts';
import { msg } from './i18n.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION_FILE = path.join(ROOT, 'VERSION'); // só existe no pacote do release
const INSTALLER = path.join(ROOT, 'scripts', 'install.sh');
export const VERSION: string = fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf8').trim() : pkg.version;
const REPO = process.env.OFFICE_REPO || String(pkg.repository?.url ?? '').match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] || '';

export type UpdateInfo = {
  version: string;
  latest: string | null;
  releaseUrl: string | null;
  checkedAt: string | null;
  canUpdate: boolean; // instalado pelo install.sh (MLO_HOME): app .app/AppImage ou serviço headless
  updating: boolean;
  error: string | null;
};

const info: UpdateInfo = {
  version: VERSION,
  latest: null,
  releaseUrl: null,
  checkedAt: null,
  canUpdate: !!process.env.MLO_HOME && fs.existsSync(VERSION_FILE) && fs.existsSync(INSTALLER) && ['darwin', 'linux'].includes(process.platform),
  updating: false,
  error: null,
};
export const updateInfo = () => ({ ...info, available: !!info.latest && newer(info.latest, info.version) });

// 1.10.0 > 1.9.3; sufixo (-dev, -rc) não conta.
export function newer(a: string, b: string) {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

export async function checkUpdate() {
  if (!REPO) return updateInfo();
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'my-local-office', ...(process.env.GITHUB_TOKEN && { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rel = (await r.json()) as { tag_name: string; html_url: string };
    const changed = info.latest !== rel.tag_name.replace(/^v/, '');
    Object.assign(info, { latest: rel.tag_name.replace(/^v/, ''), releaseUrl: rel.html_url, checkedAt: new Date().toISOString() });
    if (changed) publish('state.changed');
  } catch (e) {
    info.checkedAt = new Date().toISOString();
    console.warn(`update check: ${(e as Error).message}`);
  }
  return updateInfo();
}

// O instalador da versão nova (correções nele valem já nesta atualização); sem acesso ao asset, o desta versão.
// Sempre uma cópia fora do app: o script substitui a pasta onde o instalado está.
async function installer(tag: string) {
  const file = path.join(os.tmpdir(), `my-local-office-update-${Date.now()}.sh`);
  try {
    const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/install.sh`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fs.writeFileSync(file, await r.text());
  } catch {
    fs.copyFileSync(INSTALLER, file);
  }
  return file;
}

export async function startUpdate() {
  const status = (s: number, m: string) => Object.assign(new Error(m), { status: s });
  if (!info.canUpdate) throw status(400, msg().updateUnavailable);
  if (info.updating) throw status(409, msg().updateRunning);
  if (!info.latest || !newer(info.latest, info.version)) throw status(409, msg().upToDate);
  info.updating = true;
  const script = await installer(`v${info.latest}`);
  const log = fs.openSync(path.join(DATA, 'update.log'), 'a');
  const args = [script, '--version', `v${info.latest}`];
  // systemd mata o cgroup inteiro do serviço ao reiniciar: o script sai dele com systemd-run.
  const viaSystemd = process.platform === 'linux' && !!process.env.INVOCATION_ID && !process.env.MLO_APP;
  const [cmd, argv] = viaSystemd ? ['systemd-run', ['--user', '--collect', '--quiet', `--setenv=MLO_HOME=${process.env.MLO_HOME}`, ...passEnv(), 'bash', ...args]] : ['bash', args];
  // detached: sessão própria, o launchd não leva o script junto quando derruba o server.
  const child = spawn(cmd, argv, { detached: true, stdio: ['ignore', log, log], env: process.env });
  child.unref();
  info.updating = true;
  info.error = null;
  child.on('exit', (code) => {
    // Chegar aqui com o server vivo e código ≠ 0 é falha (com sucesso o serviço reinicia antes).
    if (code) Object.assign(info, { updating: false, error: `install.sh exited with ${code} (see ${path.join(DATA, 'update.log')})` });
    publish('state.changed');
  });
  child.on('error', (e) => {
    Object.assign(info, { updating: false, error: e.message });
    publish('state.changed');
  });
  publish('state.changed');
  return updateInfo();
}

// Variáveis do serviço que o install.sh regrava no plist/unit (porta, host, token, label).
const passEnv = () =>
  ['OFFICE_PORT', 'OFFICE_HOST', 'OFFICE_TOKEN', 'MLO_LABEL', 'MLO_MODE', 'GITHUB_TOKEN', 'PATH'].flatMap((k) => (process.env[k] ? [`--setenv=${k}=${process.env[k]}`] : []));
