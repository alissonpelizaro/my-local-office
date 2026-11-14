import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { type Activity, publish, setActivity } from './bus.ts';
import { CLAUDE_BIN, OFFICE_TOOL_TIMEOUT_MS, PORT } from './config.ts';
import { type Employee, get, type Provider, run, UPLOADS } from './db.ts';
import { childEnv } from './providers.ts';
import { settings } from './settings.ts';

export type RunKind = 'task' | 'consult' | 'onboard';
export type RunContext = {
  token: string;
  kind: RunKind;
  employee: Employee;
  cwd: string;
  taskId: number | null;
  depth: number;
  chain: number[];
};
export type RunResult = { text: string; sessionId: string | null; costUsd: number; isError: boolean };
export type Run = { ctx: RunContext; send(text: string): boolean; stop(): void; done: Promise<RunResult> };

const runs = new Map<string, Run>();
export const runByToken = (token: string) => runs.get(token);
export const stopAll = () => runs.forEach((r) => r.stop());
const busy = (employeeId: number) => [...runs.values()].some((r) => r.ctx.employee.id === employeeId);

const OFFICE_TOOLS = ['directory', 'ask_colleague', 'delegate_task', 'ask_boss'].map((t) => `mcp__office__${t}`);
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const TOOL_ACTIVITY: Record<string, Activity> = {
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  WebFetch: 'reading',
  WebSearch: 'reading',
  Edit: 'typing',
  Write: 'typing',
  MultiEdit: 'typing',
  NotebookEdit: 'typing',
  Bash: 'running',
  Task: 'delegating',
  Agent: 'delegating',
  mcp__office__ask_colleague: 'talking',
  mcp__office__delegate_task: 'delegating',
  mcp__office__ask_boss: 'waiting',
};
const KIND_ACTIVITY: Record<RunKind, Activity> = { task: 'thinking', consult: 'consulting', onboard: 'onboarding' };

export function summarize(input: any): string {
  const s = input?.command ?? input?.file_path ?? input?.notebook_path ?? input?.pattern ?? input?.url ?? input?.question ?? input?.title;
  return String(s ?? JSON.stringify(input ?? {})).slice(0, 300);
}

// Dados extras que a conversa mostra melhor que o resumo: descrição do comando e o plano (TodoWrite).
const toolExtra = (name: string, input: any) =>
  name === 'Bash' && input?.description ? { description: String(input.description).slice(0, 200) } : name === 'TodoWrite' && Array.isArray(input?.todos) ? { todos: input.todos.slice(0, 30) } : {};

const userMessage = (text: string) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';

export type StartRun = {
  kind: RunKind;
  employee: Employee;
  prompt: string;
  systemPrompt: string;
  taskId?: number | null;
  depth?: number;
  chain?: number[];
  tools?: string[];
  model?: string;
  effort?: string; // '' força o padrão do Claude Code
  resume?: string;
  fork?: boolean; // retoma numa cópia da sessão, sem alterar a original
  cwd?: string;
};

// Um processo `claude -p` por execução, no repo do funcionário. O stream-json de saída vira eventos do escritório;
// permissões e as tools do escritório passam pelo MCP "office" deste servidor, autenticado pelo token da execução.
export function startRun(o: StartRun): Run {
  const token = crypto.randomBytes(24).toString('hex');
  const cwd = o.cwd ?? o.employee.repo_path;
  const ctx: RunContext = { token, kind: o.kind, employee: o.employee, cwd, taskId: o.taskId ?? null, depth: o.depth ?? 0, chain: o.chain ?? [] };
  const ids = { employeeId: o.employee.id, taskId: ctx.taskId };
  const provider = o.employee.provider_id == null ? undefined : get<Provider>('SELECT * FROM providers WHERE id = ?', o.employee.provider_id);
  const s = settings();
  const model = provider ? undefined : (o.model ?? o.employee.model ?? s.defaultModel);
  const effort = o.effort ?? o.employee.effort ?? s.defaultEffort;
  // O Claude Code compacta ao chegar perto da janela; sem isso, modelos de 1M deixam a sessão crescer (e cada chamada relê tudo).
  const windows = [s.compactWindow, provider?.context_window ?? 0].filter((n) => n > 0);
  // O Claude Code desiste de tool MCP HTTP que passa 5 min sem responder; consulta a colega e resposta do chefe
  // (aprovação, ask_boss) demoram mais que isso. O `timeout` do servidor estende essa espera.
  const office = { type: 'http', url: `http://127.0.0.1:${PORT}/mcp`, headers: { Authorization: `Bearer ${token}` }, timeout: OFFICE_TOOL_TIMEOUT_MS };
  const mcp = { mcpServers: { office } };
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--mcp-config', JSON.stringify(mcp),
    // Conectores claude.ai e MCPs do usuário/projeto somam ~50K tokens de tools a cada chamada: só em task, e só se o funcionário pedir.
    ...(o.kind === 'task' && o.employee.connectors ? [] : ['--strict-mcp-config']),
    '--permission-prompt-tool', 'mcp__office__approve',
    '--allowedTools', OFFICE_TOOLS.join(','),
    '--add-dir', UPLOADS,
    '--append-system-prompt', o.systemPrompt,
    ...(model ? ['--model', model] : []),
    ...(EFFORTS.includes(effort) ? ['--effort', effort] : []),
    ...(o.tools ? ['--tools', o.tools.join(',')] : []),
    ...(o.resume ? ['--resume', o.resume, ...(o.fork ? ['--fork-session'] : [])] : []),
  ];

  const env = { ...childEnv(provider), ...(windows.length && { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(Math.min(...windows)) }) };
  const child = spawn(CLAUDE_BIN, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {}); // EPIPE quando o processo morre antes de ler
  child.stdin.write(userMessage(o.prompt));

  let sessionId: string | null = null;
  let runModel: string | null = null;
  let result: RunResult | undefined;
  let stderr = '';
  child.stderr.on('data', (b) => (stderr = (stderr + b).slice(-4000)));
  setActivity(o.employee.id, KIND_ACTIVITY[o.kind]);

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let m: any;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.type === 'system' && m.subtype === 'init') {
      sessionId = m.session_id;
      runModel = m.model ?? null;
      publish('run.started', { kind: o.kind, sessionId, model: m.model, provider: provider?.name ?? null }, ids);
    } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
      publish('agent.compact', { kind: o.kind, trigger: m.compact_metadata?.trigger, preTokens: m.compact_metadata?.pre_tokens }, ids);
    } else if (m.type === 'assistant') {
      for (const b of m.message?.content ?? []) {
        if (b.type === 'text' && b.text.trim()) {
          publish('agent.text', { kind: o.kind, text: b.text }, ids);
        } else if (b.type === 'tool_use') {
          publish('agent.tool', { kind: o.kind, name: b.name, summary: summarize(b.input), ...toolExtra(b.name, b.input) }, ids);
          if (o.kind === 'task') setActivity(o.employee.id, TOOL_ACTIVITY[b.name] ?? 'running', b.name);
        }
      }
    } else if (m.type === 'result') {
      result = {
        text: m.result ?? '',
        sessionId: m.session_id ?? sessionId,
        // Modelo local (Ollama) não custa nada; o CLI estimaria com o preço de um modelo Claude.
        costUsd: provider && /\/\/(127\.0\.0\.1|localhost)\b/.test(provider.base_url) ? 0 : (m.total_cost_usd ?? 0),
        isError: Boolean(m.is_error) || m.subtype !== 'success',
      };
      // Com stdin aberto o CLI espera a próxima mensagem. Fecha no primeiro result: mensagem absorvida no meio do turno
      // não gera result próprio (contar enviadas deixava o processo pendurado), e a que ficou na fila vira turno antes de sair.
      child.stdin.end();
    }
  });

  const done = new Promise<RunResult>((resolve) => {
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      runs.delete(token);
      if (!busy(o.employee.id)) setActivity(o.employee.id, 'idle');
      // Custo por execução (task, consulta, onboarding), com nome e departamento congelados para o histórico.
      if (result?.costUsd) {
        run(
          'INSERT INTO usage (employee_id, employee_name, department_id, task_id, kind, model, cost_usd, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          o.employee.id,
          o.employee.name,
          o.employee.department_id,
          ctx.taskId,
          o.kind,
          runModel,
          result.costUsd,
          result.sessionId,
        );
      }
      resolve(result ?? { text: stderr.trim() || `claude saiu com código ${code}`, sessionId, costUsd: 0, isError: true });
    };
    child.on('error', (e) => {
      stderr += e.message;
      finish(null);
    });
    child.on('close', finish);
  });

  const handle: Run = {
    ctx,
    done,
    send(text) {
      if (child.stdin.writableEnded) return false;
      child.stdin.write(userMessage(text));
      return true;
    },
    stop() {
      child.kill('SIGTERM');
      setTimeout(() => child.exitCode == null && child.kill('SIGKILL'), 5000).unref();
    },
  };
  runs.set(token, handle);
  return handle;
}
