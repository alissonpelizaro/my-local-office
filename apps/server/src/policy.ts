// Regras puras do permission prompt: o que é ação externa, como vira regra "sempre permitir" e se uma regra cobre a chamada.
import path from 'node:path';

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// Ações que saem da máquina: sempre perguntam, nunca viram regra "sempre permitir".
const EXTERNAL_BASH =
  /\bgit\s+push\b|\bgh\s+(pr|issue)\s+(review|merge|comment|create|close|edit|reopen)\b|\bgh\s+release\s+create\b|\bgh\s+api\b.*-X\s*(POST|PATCH|PUT|DELETE)|\b(docker|kubectl|gcloud|terraform)\b|\b(npm|pnpm|yarn)\s+publish\b/;
const EXTERNAL_MCP = /send|reply|forward|post|draft|delete|trash|merge|create|update|share/i;
// Regra por prefixo não cobre comandos compostos: `git status && rm -rf x` não herda `Bash:git status`.
const COMPOUND = /[;&|`<>\n]|\$\(/;

export const isExternal = (name: string, input: any) =>
  name === 'Bash'
    ? EXTERNAL_BASH.test(String(input?.command ?? ''))
    : name.startsWith('mcp__') && !name.startsWith('mcp__office__') && EXTERNAL_MCP.test(name);

export const ruleFor = (name: string, input: any) =>
  name === 'Bash' ? `Bash:${String(input?.command ?? '').trim().split(/\s+/).slice(0, 2).join(' ')}` : name;

export function allowedByRule(rules: string[], name: string, input: any) {
  if (name !== 'Bash') return rules.includes(name);
  const cmd = String(input?.command ?? '').trim();
  return !COMPOUND.test(cmd) && rules.some((r) => r.startsWith('Bash:') && (cmd === r.slice(5) || cmd.startsWith(`${r.slice(5)} `)));
}

export const isInside = (root: string, file: string) => {
  const rel = path.relative(root, path.resolve(root, file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
