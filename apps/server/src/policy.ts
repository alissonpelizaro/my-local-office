// Regras puras do permission prompt: o que é ação externa, como vira regra "sempre permitir" e se uma regra cobre a chamada.
import path from 'node:path';

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// Ações que saem da máquina: sempre perguntam, nunca viram regra "sempre permitir".
const EXTERNAL_BASH =
  /\bgit\s+push\b|\bgh\s+(pr|issue)\s+(review|merge|comment|create|close|edit|reopen)\b|\bgh\s+release\s+create\b|\b(docker|kubectl|gcloud|terraform)\b|\b(npm|pnpm|yarn)\s+publish\b/;
const EXTERNAL_MCP = /send|reply|forward|post|draft|delete|trash|merge|create|update|share/i;

// `gh api` escreve com método não-GET, --input, arquivo (@) ou campos (-f/-F viram POST) fora de uma consulta GraphQL.
function ghApiWrites(args: string[]) {
  if (args.some((a) => a.startsWith('--input') || /(^|=)@/.test(a))) return true;
  const method = args.join(' ').match(/(?:-X|--method)[\s=]*([a-z]+)/i)?.[1];
  if (method) return method.toUpperCase() !== 'GET';
  const graphqlQuery = args.some((a) => /^\/?graphql$/.test(a)) && !args.some((a) => /mutation/i.test(a));
  return !graphqlQuery && args.some((a) => /^(-[fF]|--(raw-)?field)/.test(a));
}

export function isExternal(name: string, input: any) {
  if (name !== 'Bash') return name.startsWith('mcp__') && !name.startsWith('mcp__office__') && EXTERNAL_MCP.test(name);
  const cmd = String(input?.command ?? '');
  return EXTERNAL_BASH.test(cmd) || (/\bgh\s+api\b/.test(cmd) && ghApiWrites(cmd.split(/\s+/)));
}

const unRtk = (tokens: string[]) => (tokens[0] === 'rtk' ? tokens.slice(1) : tokens); // rtk: proxy do usuário, transparente

export const ruleFor = (name: string, input: any) =>
  name === 'Bash' ? `Bash:${unRtk(String(input?.command ?? '').trim().split(/\s+/)).slice(0, 2).join(' ')}` : name;

// Composto passa quando cada trecho é coberto por uma regra ou é só leitura: `pnpm test 2>&1 | tail` herda `Bash:pnpm test`.
export function allowedByRule(rules: string[], name: string, input: any, cwd: string) {
  if (name !== 'Bash') return rules.includes(name);
  const prefixes = rules.filter((r) => r.startsWith('Bash:')).map((r) => unRtk(r.slice(5).trim().split(/\s+/))).filter((p) => p.length);
  return segments(input?.command)?.every((t) => prefixes.some((p) => p.every((w, i) => t[i] === w)) || readOnlySegment(t, cwd)) ?? false;
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
  'date', 'uname', 'whoami', 'hostname', 'git', 'gh',
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
const GH_READ_ONLY: Record<string, string[]> = {
  pr: ['list', 'view', 'diff', 'checks', 'status'],
  issue: ['list', 'view', 'status'],
  search: ['prs', 'issues', 'repos', 'code', 'commits'],
  repo: ['list', 'view'],
  run: ['list', 'view'],
  release: ['list', 'view'],
};
const SAFE_REDIRECT =/(^|\s)(2>&1|[12&]?>\s?\/dev\/null)(?=[\s;|&]|$)/g;

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

const segments = (command: unknown) => parseShell(String(command ?? '').replace(SAFE_REDIRECT, ' ').trim())?.map(unRtk) ?? null;

function readOnlySegment([program, ...args]: string[], cwd: string) {
  if (!program || !READ_ONLY.has(program)) return false;
  if (args.some((a) => BANNED_FLAGS[program]?.test(a))) return false;
  // Argumentos do gh são repos e endpoints, não caminhos.
  if (program === 'gh') return args[0] === 'api' ? !ghApiWrites(args) : Boolean(GH_READ_ONLY[args[0]]?.includes(args[1]));
  if (program === 'git') {
    const sub = args.find((a) => !a.startsWith('-'));
    if (!sub || !GIT_READ_ONLY.has(sub) || args.indexOf(sub) !== 0) return false; // nada de `git -C outro/lugar`
    const rest = args.slice(1);
    if (GIT_LIST_ONLY[sub] && !rest.every((a) => GIT_LIST_ONLY[sub].test(a))) return false;
  }
  // Caminhos fora da pasta de trabalho (absolutos, ~, ..) pedem permissão, como o Read do Claude Code.
  return args.every((a) => a.startsWith('-') || !/^[~/]|(^|\/)\.\.(\/|$)/.test(a) || (!a.startsWith('~') && isInside(cwd, a)));
}

export const isReadOnlyCommand = (command: string, cwd: string) => segments(command)?.every((t) => readOnlySegment(t, cwd)) ?? false;
