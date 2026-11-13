import { publish } from './bus.ts';
import { all, get, run } from './db.ts';

export const LANGUAGES = ['en', 'pt', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

const DEFAULTS = {
  language: 'en' as Language, // interface, notificações e idioma das respostas dos agentes
  onboardingDone: false, // assistente de primeiro acesso já foi concluído ou dispensado
  maxConcurrent: Number(process.env.OFFICE_MAX_CONCURRENT) || 3,
  delegationNeedsApproval: process.env.OFFICE_DELEGATION_APPROVAL !== '0',
  defaultModel: 'sonnet',
  onboardModel: 'haiku',
  consultModel: 'sonnet', // consultas entre colegas são só leitura; '' usa o modelo do colega
  defaultEffort: '', // low | medium | high | xhigh | max; '' deixa o Claude Code decidir
  compactWindow: 200_000, // tokens: a conversa é compactada antes de passar disso; 0 deixa o Claude Code decidir
  importRoot: '~',
  notifyApprovals: true,
  notifyTaskFinished: true,
  autoAllowReadOnly: true, // comandos de shell só de leitura (ls, cat, grep, git log…) não pedem permissão
  onlyAskExternal: true, // só pede permissão para ação externa (push, PR, publish…), destrutiva (reset --hard, rm -r, kill…) e edição fora da pasta de trabalho
  profileRefreshCommits: 40, // ficha automática é refeita quando o repo andou isso de commits; 0 desliga
};
export type Settings = typeof DEFAULTS;

// Escritórios anteriores ao multi-idioma eram só em português: mantêm o idioma em vez de virar inglês.
if (!get('SELECT 1 FROM settings WHERE key = ?', 'language') && get('SELECT 1 FROM employees LIMIT 1')) {
  run('INSERT INTO settings (key, value) VALUES (?, ?)', 'language', JSON.stringify('pt'));
}

export function settings(): Settings {
  const saved = Object.fromEntries(all<{ key: string; value: string }>('SELECT * FROM settings').map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULTS, ...saved };
}

export function updateSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!(key in DEFAULTS)) throw Object.assign(new Error(`unknown setting: ${key}`), { status: 400 });
    if (typeof value !== typeof DEFAULTS[key as keyof Settings]) throw Object.assign(new Error(`invalid type for ${key}`), { status: 400 });
    if (key === 'language' && !LANGUAGES.includes(value as Language)) throw Object.assign(new Error(`language must be ${LANGUAGES.join(', ')}`), { status: 400 });
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
  publish('state.changed');
  return settings();
}
