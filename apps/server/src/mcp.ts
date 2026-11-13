// Servidor MCP "office" mínimo (Streamable HTTP, só respostas JSON). Cada execução do runner se autentica com o próprio token.
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as office from './office.ts';
import { type RunContext, runByToken } from './runner.ts';

const str = (description: string) => ({ type: 'string', description });

const TOOLS = [
  {
    name: 'directory',
    description: 'Lists the office departments and employees, with each one\'s profile (repository, purpose, stack). Use it to find out who is responsible for which repository.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_colleague',
    description:
      'Asks the employee responsible for another repository something and waits for the answer, which can take several minutes: put everything you need in one self-contained question. They only read their own code (read-only tools, git and gh): nothing is changed. Use it instead of reading other repositories directly; for any action in their repository (change code, review or approve a PR, run a command), use delegate_task.',
    inputSchema: {
      type: 'object',
      properties: { to: str('Employee name (see directory)'), question: str('Self-contained question, with the context needed') },
      required: ['to', 'question'],
    },
  },
  {
    name: 'delegate_task',
    description:
      'Creates a task for another employee when something must be done in their repository (change code, review or approve a PR, run a command). It may need the boss\'s approval and runs independently: it does not wait for completion.',
    inputSchema: {
      type: 'object',
      properties: { to: str('Employee name (see directory)'), title: str('Short task title'), description: str('What to do, why and the definition of done') },
      required: ['to', 'title', 'description'],
    },
  },
  {
    name: 'ask_boss',
    description: 'Asks the boss (the user) a question and waits for the answer. Use it for decisions that are not yours to make.',
    inputSchema: {
      type: 'object',
      properties: { question: str('Question'), options: { type: 'array', items: { type: 'string' }, description: 'Suggested options (optional)' } },
      required: ['question'],
    },
  },
  {
    name: 'approve',
    description: 'Internal use by the office permission system. Do not call it directly.',
    inputSchema: {
      type: 'object',
      properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
      required: ['tool_name', 'input'],
    },
  },
];

async function callTool(ctx: RunContext, name: string, a: any): Promise<string> {
  switch (name) {
    case 'approve':
      return JSON.stringify(await office.approveTool(ctx, a.tool_name, a.input ?? {}));
    case 'directory':
      return office.directory();
    case 'ask_colleague':
      return office.askColleague(ctx, a.to, a.question);
    case 'delegate_task':
      return office.delegateTask(ctx, a.to, a.title, a.description ?? '');
    case 'ask_boss':
      return office.askBoss(ctx, a.question, a.options);
  }
  throw new Error(`unknown tool: ${name}`);
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method?: string; params?: any };

async function dispatch(ctx: RunContext, m: Rpc) {
  switch (m.method) {
    case 'initialize':
      return {
        protocolVersion: m.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'office', version: '0.1.0' },
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      try {
        return { content: [{ type: 'text', text: await callTool(ctx, m.params?.name, m.params?.arguments ?? {}) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
      }
  }
  throw Object.assign(new Error(`unsupported method: ${m.method}`), { code: -32601 });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export async function handleMcp(req: IncomingMessage, res: ServerResponse, body: Rpc | Rpc[]) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const r = token ? runByToken(token) : undefined;
  if (!r) return json(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unknown run' } });

  const replies = [];
  for (const m of Array.isArray(body) ? body : [body]) {
    if (m.id === undefined || !m.method) continue; // notificações e respostas não têm retorno
    try {
      replies.push({ jsonrpc: '2.0', id: m.id, result: await dispatch(r.ctx, m) });
    } catch (e: any) {
      replies.push({ jsonrpc: '2.0', id: m.id, error: { code: e.code ?? -32603, message: e.message } });
    }
  }
  if (!replies.length) {
    res.writeHead(202).end();
    return;
  }
  json(res, 200, Array.isArray(body) ? replies : replies[0]);
}
