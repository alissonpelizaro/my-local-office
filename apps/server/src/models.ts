// Modelos disponíveis para os funcionários.
// - Aliases (opus/sonnet/haiku): a versão por trás vem do `init` do CLI, que sai antes da chamada à API; o processo
//   é encerrado ali, sem gastar tokens.
// - Versões novas: testadas com uma chamada mínima. O CLI repassa qualquer ID sem validar, então só a API diz se a
//   assinatura e a versão do Claude Code aceitam o modelo.
import { execFile, spawn } from 'node:child_process';
import readline from 'node:readline';
import { CLAUDE_BIN } from './config.ts';
import { DATA } from './db.ts';
import { childEnv } from './providers.ts';

const ALIASES = ['opus', 'sonnet', 'haiku'];
const CANDIDATES = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];

export type ModelInfo = { id: string; status: 'ok' | 'update' | 'unavailable'; requires?: string; note?: string };
type Cache = { cli: string | null; aliases: { alias: string; model: string | null }[]; models: ModelInfo[]; probedAt: string | null };

let cache: Cache = { cli: null, aliases: ALIASES.map((alias) => ({ alias, model: null })), models: [], probedAt: null };
let refreshing: Promise<Cache> | null = null;

const BASE_ARGS = ['--tools', '', '--strict-mcp-config', '--no-session-persistence'];

function resolveAlias(alias: string) {
  return new Promise<string | null>((resolve) => {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', alias, ...BASE_ARGS];
    const child = spawn(CLAUDE_BIN, args, { cwd: DATA, env: childEnv(undefined), stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    let model: string | null = null;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      // Hooks de SessionStart também emitem linhas "system" antes do init.
      if (m.type === 'system' && m.subtype !== 'init') return;
      if (m.subtype === 'init') model = m.model ?? null;
      child.kill('SIGKILL');
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(model);
    });
    child.on('error', () => resolve(null));
    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'ok' } }) + '\n');
  });
}

// Chamada real e mínima: system prompt curto, sem tools, resposta de uma palavra.
function check(id: string) {
  return new Promise<ModelInfo>((resolve) => {
    const args = ['-p', 'Reply only: ok', '--model', id, '--system-prompt', 'Reply briefly.', '--output-format', 'json', ...BASE_ARGS];
    execFile(CLAUDE_BIN, args, { cwd: DATA, env: childEnv(undefined), timeout: 60_000 }, (_err, stdout) => {
      try {
        const r = JSON.parse(stdout);
        if (!r.is_error) return resolve({ id, status: 'ok' });
        const msg = String(r.result ?? '');
        const requires = msg.match(/version ([\d.]+) or newer is required/)?.[1];
        resolve(requires ? { id, status: 'update', requires } : { id, status: 'unavailable', note: msg.slice(0, 200) });
      } catch {
        resolve({ id, status: 'unavailable', note: stdout.slice(0, 200) || 'no answer from the CLI' });
      }
    });
  });
}

function cliVersion() {
  return new Promise<string | null>((resolve) =>
    execFile(CLAUDE_BIN, ['--version'], { env: childEnv(undefined), timeout: 10_000 }, (_e, out) => resolve(out.match(/[\d.]+/)?.[0] ?? null)),
  );
}

export function refreshModels() {
  refreshing ??= (async () => {
    const [cli, resolved, checked] = await Promise.all([cliVersion(), Promise.all(ALIASES.map(resolveAlias)), Promise.all(CANDIDATES.map(check))]);
    // Versões por trás dos aliases também ficam disponíveis como versão fixa.
    const fixed = resolved.filter((m): m is string => !!m && !CANDIDATES.includes(m)).map((id): ModelInfo => ({ id, status: 'ok' }));
    cache = { cli, aliases: ALIASES.map((alias, i) => ({ alias, model: resolved[i] })), models: [...checked, ...fixed], probedAt: new Date().toISOString() };
    return cache;
  })().finally(() => (refreshing = null));
  return refreshing;
}

export const models = () => cache;
