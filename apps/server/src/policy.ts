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

// Destrutivo: descarta trabalho sem volta (git; branch apagada volta pelo reflog), mexe em processos e serviços,
// escreve em banco ou apaga fora da pasta de trabalho. No modo "só externas e destrutivas" é o que ainda pede permissão.
// ponytail: padrões sobre o texto do comando (alias ou script escapam); a rede de segurança de verdade é o git.
const DESTRUCTIVE_BASH = new RegExp(
  [
    String.raw`\bgit\s+(reset\s+[^;&|\n]*--hard|clean\s+([^;&|\n]*\s)?-\w*f|checkout\s+([^;&|\n]*\s)?(--|\.|-f|--force)(\s|$)|restore\s|stash\s+(drop|clear)|filter-(branch|repo))`,
    String.raw`(^|[\s;&|(])(sudo|kill|pkill|killall|shutdown|reboot|mkfs\S*|dd|diskutil|crontab)\s`,
    String.raw`\b(launchctl|systemctl)\s+(?!(--user\s+)?(list|print|status|show|is-active|cat)\b)\S`,
    String.raw`\bfind\s[^;&|\n]*\s-delete\b`,
  ].join('|'),
);
const DB_WRITE = /\b(drop\s+(table|database|schema|index|view)|truncate\s+table|delete\s+from|insert\s+into|update\s+[\w."]+\s+set|alter\s+table|flushall|flushdb)\b/i;
const TMP = /^(\/private)?(\/tmp|\/var\/folders\/[^/]+\/[^/]+\/T)\/[^/*?]/;
const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, '$2');

// rm passa dentro da pasta de trabalho; recursivo, só em pasta temporária. Segue `cd` e variáveis atribuídas antes
// no mesmo comando (`W=/tmp/x; rm -rf $W`); variável de fora dele fica desconhecida.
function removesTooMuch(cmd: string, cwd: string) {
  let dir: string | null = cwd;
  const vars: Record<string, string> = process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {};
  const expand = (s: string) => unquote(s).replace(/\$\{?(\w+)\}?/g, (m, k) => vars[k] ?? m);
  for (const [, name, value, cd, rm] of cmd.matchAll(/(?:^|[\s;&|(])(?:([A-Za-z_]\w*)=([^\s;&|)]*)|cd\b([^;&|\n)]*)|rm\s+([^;&|\n)]*))/g)) {
    if (name) {
      vars[name] = expand(value);
      continue;
    }
    if (cd !== undefined) {
      const to = expand(cd.trim().split(/\s+/)[0]); // `cd` sozinho vai para o HOME: pasta desconhecida
      dir = dir && /^[^~$-]/.test(to) ? path.resolve(dir, to) : null;
      continue;
    }
    const words = rm.trim().split(/\s+/).map(expand);
    const recursive = words.some((w) => /^-\w*[rR]|^--recursive$/.test(w));
    const targets = words.filter((w) => w && !w.startsWith('-'));
    if (!targets.length) return true; // `xargs rm`: não dá para saber o quê
    for (const t of targets) {
      const full = dir && !/[~$`]/.test(t) ? path.resolve(dir, t) : null;
      if (!full || (!TMP.test(full) && (recursive || !isInside(cwd, full)))) return true;
    }
  }
  return false;
}

export function isDestructive(name: string, input: any, cwd: string) {
  if (name !== 'Bash') return false;
  const cmd = String(input?.command ?? '');
  return DESTRUCTIVE_BASH.test(cmd) || DB_WRITE.test(cmd) || removesTooMuch(cmd, cwd);
}

// rtk: proxy do usuário, transparente (`rtk proxy <cmd>` roda o comando cru).
const unRtk = (tokens: string[]) => (tokens[0] !== 'rtk' ? tokens : tokens.slice(tokens[1] === 'proxy' ? 2 : 1));

// Composto passa quando cada trecho é coberto por uma regra ou é só leitura: `pnpm test 2>&1 | tail` herda `Bash:pnpm test`.
function covered(rules: string[], cwd: string) {
  const prefixes = rules.filter((r) => r.startsWith('Bash:')).map((r) => unRtk(r.slice(5).trim().split(/\s+/))).filter((p) => p.length);
  return (t: string[]) => prefixes.some((p) => p.every((w, i) => t[i] === w)) || readOnlySegment(t, cwd);
}

export function allowedByRule(rules: string[], name: string, input: any, cwd: string) {
  if (name !== 'Bash') return rules.includes(name);
  return segments(input?.command)?.every(covered(rules, cwd)) ?? false;
}

// O que "sempre permitir" grava: um prefixo de duas palavras por trecho ainda não coberto
// (`cd x && npx tsc | tail` vira `Bash:npx tsc`). Sintaxe que não analisamos nunca casaria com regra: nada a gravar.
export function rulesFor(rules: string[], name: string, input: any, cwd: string) {
  if (name !== 'Bash') return [name];
  const isCovered = covered(rules, cwd);
  return [...new Set((segments(input?.command) ?? []).filter((t) => !isCovered(t)).map((t) => `Bash:${t.slice(0, 2).join(' ')}`))];
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
  'date', 'uname', 'whoami', 'hostname', 'git', 'gh', 'cd', 'sed',
]);
const GIT_READ_ONLY = new Set([
  'status', 'log', 'diff', 'show', 'ls-files', 'ls-tree', 'rev-parse', 'blame', 'grep', 'describe', 'shortlog', 'cat-file', 'branch', 'remote', 'tag',
  'worktree', 'merge-base', 'rev-list', 'for-each-ref', 'show-ref', 'name-rev', 'ls-remote', 'fetch',
]);
// Flags que fazem programas "de leitura" escreverem arquivos ou executarem comandos.
const BANNED_FLAGS: Record<string, RegExp> = {
  find: /^-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)$/,
  rg: /^--pre(=|$)/,
  sort: /^(-o|--output(=|$))/,
  tree: /^-o$/,
  git: /^--(output|upload-pack|receive-pack)(=|$)/,
};
// Subcomandos do git que só leem quando usados sem argumentos além destas flags.
const GIT_LIST_ONLY: Record<string, RegExp> = {
  remote: /^(-v|--verbose)$/,
  worktree: /^list$/,
};
// branch e tag só com flags de listagem; argumento solto (padrão, commit) só no modo lista, senão criaria a branch/tag.
const GIT_LIST_FLAGS: Record<string, RegExp> = {
  branch: /^(-[ailrv]+|--(all|remotes|list|verbose|ignore-case|show-current|no-color|color|no-column|no-abbrev)|--(no-)?(contains|merged)|--points-at|--(sort|format|color|column|abbrev)=.+)$/,
  tag: /^(-[li]+|-n\d*|--(list|ignore-case|no-color|color|no-column)|--(no-)?(contains|merged)|--points-at|--(sort|format|color|column)=.+)$/,
};
const GIT_LIST_MODE = /^(-\w*l\w*|--list|--(no-)?(contains|merged)|--points-at)$/;
// sed que só imprime: linhas por número (`10,20p`) ou s/// sem os modificadores que escrevem (w) ou executam (e).
const SED_PRINT = /^((\d+|\$)(,(\d+|\$))?p|s(?<d>[^\\\n])(\\.|(?!\k<d>).)*\k<d>(\\.|(?!\k<d>).)*\k<d>[gpiImM\d]*)$/;
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
    if (c === '$' && cmd[i + 1] === '?') {
      token += cmd[i++] + cmd[i]; // status do último comando (`echo rc=$?`): só texto
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === '\\') token += '$`"\\'.includes(cmd[i + 1]) ? cmd[++i] : c; // `grep "a\|b"`: \ só escapa $ ` " \
      else if (quote === '"' && (c === '$' || c === '`')) return null;
      else token += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      quoted = true;
    } else if (c === ' ' || c === '\t') push();
    else if (c === '\n') {
      push(); // quebra de linha separa comandos como `;` (linha em branco ou depois de `|`/`&&` não abre segmento vazio)
      if (segments.at(-1)!.length) segments.push([]);
    } else if (c === '|' || c === ';' || (c === '&' && cmd[i + 1] === '&')) {
      push();
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      segments.push([]);
    } else if ('`$<>&\\(){}'.includes(c)) return null;
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
  const inside = (p: string) => !p.startsWith('~') && isInside(cwd, p);
  // Só para dentro da pasta de trabalho, com destino explícito (`cd` sozinho e `cd -` saem dela).
  if (program === 'cd') return args.length === 1 && !args[0].startsWith('-') && inside(args[0]);
  // Argumentos do gh são repos e endpoints, não caminhos.
  if (program === 'gh') return args[0] === 'api' ? !ghApiWrites(args) : Boolean(GH_READ_ONLY[args[0]]?.includes(args[1]));
  if (program === 'git') {
    // `git -C <pasta>` só para dentro da pasta de trabalho; outras opções globais (-c, --git-dir…) pedem permissão.
    while (args[0] === '--no-pager' || (args[0] === '-C' && args[1] && inside(args[1]))) args = args.slice(args[0] === '-C' ? 2 : 1);
    const [sub, ...rest] = args;
    if (!GIT_READ_ONLY.has(sub)) return false;
    if (GIT_LIST_ONLY[sub] && !rest.every((a) => GIT_LIST_ONLY[sub].test(a))) return false;
    if (GIT_LIST_FLAGS[sub] && !rest.every((a) => (a.startsWith('-') ? GIT_LIST_FLAGS[sub].test(a) : rest.some((f) => GIT_LIST_MODE.test(f))))) return false;
    // fetch só atualiza as refs remotas: refspec com `:` criaria branch local, --depth deixaria o repo raso, --prune-tags apaga tags.
    if (sub === 'fetch' && rest.some((a) => a.includes(':') || /^(-u|-P|--update-head-ok|--prune-tags|--depth|--deepen|--shallow-\w+)(=|$)/.test(a))) return false;
  }
  if (program === 'sed') {
    const scripts = args.flatMap((a, i) => (args[i - 1] === '-e' ? [a] : []));
    if (!scripts.length) scripts.push(...args.filter((a) => !a.startsWith('-')).slice(0, 1));
    if (!scripts.length || !scripts.every((s) => s.split(';').every((c) => SED_PRINT.test(c.trim())))) return false;
    if (!args.every((a, i) => !a.startsWith('-') || args[i - 1] === '-e' || /^(-[nEr]+|-e|--quiet|--silent|--regexp-extended)$/.test(a))) return false;
  }
  // Caminhos fora da pasta de trabalho (absolutos, ~, ..) pedem permissão, como o Read do Claude Code.
  return args.every((a) => a.startsWith('-') || !/^[~/]|(^|\/)\.\.(\/|$)/.test(a) || inside(a));
}

export const isReadOnlyCommand = (command: string, cwd: string) => segments(command)?.every((t) => readOnlySegment(t, cwd)) ?? false;
