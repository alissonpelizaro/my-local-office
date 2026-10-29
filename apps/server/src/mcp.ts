// Servidor MCP "office" mínimo (Streamable HTTP, só respostas JSON). Cada execução do runner se autentica com o próprio token.
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as office from './office.ts';
import { type RunContext, runByToken } from './runner.ts';

const str = (description: string) => ({ type: 'string', description });

const TOOLS = [
  {
    name: 'directory',
    description: 'Lista os departamentos e funcionários do escritório, com a ficha de cada um (repositório, propósito, stack). Use para descobrir quem é responsável por qual repositório.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_colleague',
    description:
      'Pergunta algo ao funcionário responsável por outro repositório e espera a resposta. Ele só lê o código dele (Read, Grep, Glob): sem shell, sem gh, sem alterar nada. Use em vez de ler outros repositórios diretamente; para qualquer ação no repositório dele (mudar código, revisar ou aprovar PR, rodar comando), use delegate_task.',
    inputSchema: {
      type: 'object',
      properties: { to: str('Nome do funcionário (veja directory)'), question: str('Pergunta autocontida, com o contexto necessário') },
      required: ['to', 'question'],
    },
  },
  {
    name: 'delegate_task',
    description:
      'Cria uma task para outro funcionário quando algo precisa ser feito no repositório dele (mudar código, revisar ou aprovar PR, rodar comando). Pode exigir aprovação do chefe e roda de forma independente: não espera a conclusão.',
    inputSchema: {
      type: 'object',
      properties: { to: str('Nome do funcionário (veja directory)'), title: str('Título curto da task'), description: str('O que fazer, por quê e critérios de pronto') },
      required: ['to', 'title', 'description'],
    },
  },
  {
    name: 'ask_boss',
    description: 'Faz uma pergunta ao chefe (o usuário) e espera a resposta. Use para decisões que não cabem a você.',
    inputSchema: {
      type: 'object',
      properties: { question: str('Pergunta'), options: { type: 'array', items: { type: 'string' }, description: 'Opções sugeridas (opcional)' } },
      required: ['question'],
    },
  },
  {
    name: 'approve',
    description: 'Uso interno do sistema de permissões do escritório. Não chame diretamente.',
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
  throw new Error(`tool desconhecida: ${name}`);
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
  throw Object.assign(new Error(`método não suportado: ${m.method}`), { code: -32601 });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export async function handleMcp(req: IncomingMessage, res: ServerResponse, body: Rpc | Rpc[]) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const r = token ? runByToken(token) : undefined;
  if (!r) return json(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'execução desconhecida' } });

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
