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

// ---------- comandos só de leitura ----------
// Exploração por shell (ls, cat, grep, git log…) não deveria pedir permissão. A análise é conservadora:
// qualquer construção que não entende (subshell, variável, redirecionamento para arquivo, programa fora da lista)
// faz o comando cair no fluxo normal de aprovação.

const READ_ONLY = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'tree', 'pwd', 'echo', 'sort', 'uniq', 'cut', 'tr', 'nl',
  'file', 'stat', 'du', 'df', 'which', 'basename', 'dirname', 'realpath', 'readlink', 'jq', 'diff', 'cmp', 'comm', 'column', 'true',
  'date', 'uname', 'whoami', 'hostname', 'git',
]);
const GIT_READ_ONLY = new Set(['status', 'log', 'diff', 'show', 'ls-files', 'ls-tree', 'rev-parse', 'blame', 'grep', 'describe', 'shortlog', 'cat-file', 'branch', 'remote', 'tag', 'worktree']);
// Flags que fazem programas "de leitura" escreverem arquivos ou executarem comandos.
const BANNED_FLAGS: Record<string, RegExp> = {
  find: /^-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)$/,
  rg: /^--pre(=|$)/,
  sort: /^(-o|--output(=|$))/,
  tree: /^-o$/,
  git: /^--output(=|$)/,
};
// Subcomandos do git que só leem quando usados sem argumentos além destas flags.
const GIT_LIST_ONLY: Record<string, RegExp> = {
  branch: /^(-a|-r|-v|-vv|--all|--remotes|--list|--show-current|--no-color|--color)$/,
  remote: /^(-v|--verbose)$/,
  tag: /^(-l|--list)$/,
  worktree: /^list$/,
};
const SAFE_REDIRECT = /(^|\s)(2>&1|[12&]?>\s?\/dev\/null)(?=[\s;|&]|$)/g;

// Divide em segmentos (| || && ;) e tokens, respeitando aspas. null = sintaxe que não analisamos.
function parseShell(cmd: string): string[][] | null {
  const segments: string[][] = [[]];
  let token = '';
  let quote: '"' | "'" | null = null;
  let quoted = false;
  const push = () => {
    if (token || quoted) segments.at(-1)!.push(token);
    token = '';
    quoted = false;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && (c === '$' || c === '`' || c === '\\')) return null;
      else token += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      quoted = true;
    } else if (c === ' ' || c === '\t') push();
    else if (c === '|' || c === ';' || (c === '&' && cmd[i + 1] === '&')) {
      push();
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      segments.push([]);
    } else if ('`$<>&\\\n(){}'.includes(c)) return null;
    else token += c;
  }
  if (quote) return null;
  push();
  return segments.every((s) => s.length) ? segments : null;
}

export function isReadOnlyCommand(command: string, cwd: string) {
  const segments = parseShell(String(command ?? '').replace(SAFE_REDIRECT, ' ').trim());
  if (!segments) return false;
  return segments.every((tokens) => {
    const [program, ...args] = tokens[0] === 'rtk' ? tokens.slice(1) : tokens; // rtk: proxy do usuário, transparente
    if (!program || !READ_ONLY.has(program)) return false;
    if (args.some((a) => BANNED_FLAGS[program]?.test(a))) return false;
    if (program === 'git') {
      const sub = args.find((a) => !a.startsWith('-'));
      if (!sub || !GIT_READ_ONLY.has(sub) || args.indexOf(sub) !== 0) return false; // nada de `git -C outro/lugar`
      const rest = args.slice(1);
      if (GIT_LIST_ONLY[sub] && !rest.every((a) => GIT_LIST_ONLY[sub].test(a))) return false;
    }
    // Caminhos fora da pasta de trabalho (absolutos, ~, ..) pedem permissão, como o Read do Claude Code.
    return args.every((a) => a.startsWith('-') || !/^[~/]|(^|\/)\.\.(\/|$)/.test(a) || (!a.startsWith('~') && isInside(cwd, a)));
  });
}
