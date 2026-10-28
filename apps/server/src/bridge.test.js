import test from 'node:test';
import assert from 'node:assert/strict';
import { toOpenAI, fromOpenAI, streamTranslator } from './bridge.js';

test('toOpenAI: system, tool_use/tool_result em ordem, imagem e tools', () => {
  const img = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } };
  const out = toOpenAI({
    model: 'm',
    max_tokens: 100,
    stream: true,
    system: [{ type: 'text', text: 'sys' }],
    tools: [{ name: 'Bash', description: 'roda', input_schema: { type: 'object' } }, { type: 'web_search_20250305', name: 'web_search' }],
    tool_choice: { type: 'any' },
    messages: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: [{ type: 'text', text: 'vou rodar' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a.txt' }, img] }, { type: 'text', text: 'e agora?' }] },
    ],
  });
  assert.deepEqual(out.messages, [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'oi' },
    { role: 'assistant', content: 'vou rodar', tool_calls: [{ id: 't1', type: 'function', function: { name: 'Bash', arguments: '{"command":"ls"}' } }] },
    { role: 'tool', tool_call_id: 't1', content: 'a.txt' },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }, { type: 'text', text: 'e agora?' }] },
  ]);
  assert.deepEqual(out.tools, [{ type: 'function', function: { name: 'Bash', description: 'roda', parameters: { type: 'object' } } }]);
  assert.equal(out.tool_choice, 'required');
  assert.deepEqual(out.stream_options, { include_usage: true });
});

test('fromOpenAI: tool call vira tool_use mesmo com finish_reason stop', () => {
  const msg = fromOpenAI(
    {
      id: 'x',
      choices: [{ finish_reason: 'stop', message: { content: 'ok', tool_calls: [{ id: 'c1', function: { name: 'Read', arguments: '{"file_path":"/a"}' } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    },
    'm',
  );
  assert.deepEqual(msg.content, [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'c1', name: 'Read', input: { file_path: '/a' } }]);
  assert.equal(msg.stop_reason, 'tool_use');
  assert.deepEqual(msg.usage, { input_tokens: 10, output_tokens: 3 });
});

test('streamTranslator: texto, depois tool com argumentos fatiados, depois usage', () => {
  const events = [];
  const t = streamTranslator('m', (event, data) => events.push([event, data]));
  t.chunk({ id: 'c', choices: [{ delta: { role: 'assistant', content: '' } }] });
  t.chunk({ id: 'c', choices: [{ delta: { content: 'Vou ' } }] });
  t.chunk({ id: 'c', choices: [{ delta: { content: 'ler.' } }] });
  t.chunk({ id: 'c', choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'Read', arguments: '{"file_' } }] } }] });
  t.chunk({ id: 'c', choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'path":"/a"}' } }] } }] });
  t.chunk({ id: 'c', choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
  t.chunk({ id: 'c', choices: [], usage: { prompt_tokens: 50, completion_tokens: 7 } });
  t.end();

  assert.deepEqual(
    events.map(([e]) => e),
    ['message_start', 'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop',
      'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'],
  );
  const text = events.filter(([, d]) => d.delta?.type === 'text_delta').map(([, d]) => d.delta.text).join('');
  const json = events.filter(([, d]) => d.delta?.type === 'input_json_delta').map(([, d]) => d.delta.partial_json).join('');
  assert.equal(text, 'Vou ler.');
  assert.deepEqual(JSON.parse(json), { file_path: '/a' });
  assert.deepEqual(events[5][1].content_block, { type: 'tool_use', id: 'call_1', name: 'Read', input: {} });
  assert.equal(events[6][1].index, 1);
  assert.deepEqual(events.at(-2)[1], {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { input_tokens: 50, output_tokens: 7 },
  });
});
