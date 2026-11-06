// Ponte Anthropic Messages ↔ OpenAI Chat Completions (streaming e tools).
import crypto from 'node:crypto';

const STOP = { stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', function_call: 'tool_use' };
const CHOICE = { auto: 'auto', any: 'required', none: 'none' };

const toolId = (id) => id || `toolu_${crypto.randomBytes(12).toString('hex')}`;
const textOf = (content) =>
  typeof content === 'string' ? content : (content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
const imagePart = ({ source: s }) => ({ type: 'image_url', image_url: { url: s.type === 'base64' ? `data:${s.media_type};base64,${s.data}` : s.url } });
const parseArgs = (s) => {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
};
const toUsage = (u) => ({ input_tokens: u?.prompt_tokens ?? 0, output_tokens: u?.completion_tokens ?? 0 });
const message = (id, model, content, stop_reason, usage) => ({
  id: id || `msg_${crypto.randomBytes(12).toString('hex')}`,
  type: 'message',
  role: 'assistant',
  model,
  content,
  stop_reason,
  stop_sequence: null,
  usage,
});

export function toOpenAI(body) {
  const messages = [];
  const system = textOf(body.system);
  if (system) messages.push({ role: 'system', content: system });
  for (const m of body.messages ?? []) {
    if (typeof m.content === 'string') {
      // O Claude Code manda saída de hooks como "system" no meio do histórico; vários chat templates (ex. Qwen) recusam.
      messages.push({ role: m.role === 'system' ? 'user' : m.role, content: m.content });
    } else if (m.role === 'assistant') {
      const toolCalls = m.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: 'assistant', content: textOf(m.content) || null, ...(toolCalls.length && { tool_calls: toolCalls }) });
    } else {
      // tool_result vira mensagem "tool" logo após o assistant (exigência da OpenAI); imagens dele seguem na mensagem do usuário.
      const parts = [];
      for (const b of m.content) {
        if (b.type === 'tool_result') {
          messages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: textOf(b.content) });
          if (Array.isArray(b.content)) parts.push(...b.content.filter((c) => c.type === 'image').map(imagePart));
        } else if (b.type === 'text') parts.push({ type: 'text', text: b.text });
        else if (b.type === 'image') parts.push(imagePart(b));
      }
      if (parts.length) {
        messages.push({ role: 'user', content: parts.every((p) => p.type === 'text') ? parts.map((p) => p.text).join('\n') : parts });
      }
    }
  }

  // Tools de servidor da Anthropic (web_search etc.) não têm input_schema e não existem do outro lado.
  const tools = (body.tools ?? [])
    .filter((t) => t.input_schema)
    .map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const tc = body.tool_choice;
  return {
    model: body.model,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop_sequences,
    stream: Boolean(body.stream),
    ...(body.stream && { stream_options: { include_usage: true } }),
    ...(tools.length && {
      tools,
      tool_choice: tc && (tc.type === 'tool' ? { type: 'function', function: { name: tc.name } } : CHOICE[tc.type]),
    }),
  };
}

export function fromOpenAI(r, model) {
  const choice = r.choices?.[0] ?? {};
  const content = [];
  if (choice.message?.content) content.push({ type: 'text', text: choice.message.content });
  for (const c of choice.message?.tool_calls ?? []) {
    content.push({ type: 'tool_use', id: toolId(c.id), name: c.function.name, input: parseArgs(c.function.arguments) });
  }
  const stop = content.some((b) => b.type === 'tool_use') ? 'tool_use' : (STOP[choice.finish_reason] ?? 'end_turn');
  return message(r.id, model, content, stop, toUsage(r.usage));
}

// Converte chunks do stream OpenAI em eventos SSE da Anthropic, chamando emit(evento, dados).
export function streamTranslator(model, emit) {
  let started = false;
  let block = -1;
  let open = null;
  let finish = null;
  const tools = new Map(); // índice da tool call no OpenAI → índice do bloco
  const usage = { input_tokens: 0, output_tokens: 0 };

  const start = (id) => {
    if (started) return;
    started = true;
    emit('message_start', { type: 'message_start', message: message(id, model, [], null, usage) });
  };
  const close = () => {
    if (open === null) return;
    emit('content_block_stop', { type: 'content_block_stop', index: block });
    open = null;
  };
  const begin = (key, contentBlock) => {
    close();
    open = key;
    emit('content_block_start', { type: 'content_block_start', index: ++block, content_block: contentBlock });
    return block;
  };
  const delta = (index, d) => emit('content_block_delta', { type: 'content_block_delta', index, delta: d });

  return {
    chunk(c) {
      start(c.id);
      if (c.usage) Object.assign(usage, toUsage(c.usage));
      const choice = c.choices?.[0];
      if (!choice) return;
      const d = choice.delta ?? {};
      if (d.content) {
        if (open !== 'text') begin('text', { type: 'text', text: '' });
        delta(block, { type: 'text_delta', text: d.content });
      }
      for (const t of d.tool_calls ?? []) {
        // Alguns servidores omitem o index: id novo = tool nova, sem id = continuação da última.
        const i = t.index ?? (t.id ? tools.size : Math.max(tools.size - 1, 0));
        if (!tools.has(i)) tools.set(i, begin(`tool${i}`, { type: 'tool_use', id: toolId(t.id), name: t.function?.name ?? '', input: {} }));
        if (t.function?.arguments) delta(tools.get(i), { type: 'input_json_delta', partial_json: t.function.arguments });
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    },
    end() {
      start();
      close();
      const stop = tools.size ? 'tool_use' : (STOP[finish] ?? 'end_turn');
      emit('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage });
      emit('message_stop', { type: 'message_stop' });
    },
  };
}

// ponytail: estimativa ~4 chars/token, só para o Claude Code ter um número; contagem real depende do tokenizer do provedor.
export const countTokens = (body) => ({ input_tokens: Math.ceil(JSON.stringify(body).length / 4) });

function sendError(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message } }));
}

export async function proxyMessages(body, res, remote) {
  if (!remote.baseUrl) return sendError(res, 400, 'provedor remoto OpenAI não configurado no hub');
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const payload = toOpenAI(body);
  const call = () =>
    fetch(`${remote.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(remote.apiKey && { authorization: `Bearer ${remote.apiKey}` }) },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

  let up;
  try {
    up = await call();
    let detail = up.ok ? '' : await up.text();
    // Modelos de raciocínio da OpenAI (o*, gpt-5) recusam max_tokens.
    if (up.status === 400 && detail.includes('max_completion_tokens')) {
      [payload.max_completion_tokens, payload.max_tokens] = [payload.max_tokens, undefined];
      up = await call();
      detail = up.ok ? '' : await up.text();
    }
    if (!up.ok) return sendError(res, up.status, `${remote.baseUrl}: ${detail}`);
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(fromOpenAI(await up.json(), body.model)));
    }
  } catch (e) {
    if (!ac.signal.aborted) sendError(res, 502, `${remote.baseUrl}: ${e.cause?.message ?? e.message}`);
    return;
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const out = streamTranslator(body.model, (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for await (const bytes of up.body) {
      const lines = (buf += decoder.decode(bytes, { stream: true })).split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const data = line.match(/^data:(.*)/)?.[1].trim();
        if (!data || data === '[DONE]') continue;
        const c = JSON.parse(data);
        if (c.error) throw new Error(c.error.message ?? JSON.stringify(c.error));
        out.chunk(c);
      }
    }
    out.end();
  } catch (e) {
    if (ac.signal.aborted) return;
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: e.message } })}\n\n`);
  }
  res.end();
}
