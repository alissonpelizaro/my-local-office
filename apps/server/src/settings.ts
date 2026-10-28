import { publish } from './bus.ts';
import { all, run } from './db.ts';

const DEFAULTS = {
  maxConcurrent: Number(process.env.OFFICE_MAX_CONCURRENT) || 3,
  delegationNeedsApproval: process.env.OFFICE_DELEGATION_APPROVAL !== '0',
  defaultModel: 'sonnet',
  onboardModel: 'haiku',
  importRoot: '~/webprojects',
  notifyApprovals: true,
  notifyTaskFinished: true,
  profileRefreshCommits: 40, // ficha automática é refeita quando o repo andou isso de commits; 0 desliga
};
export type Settings = typeof DEFAULTS;

export function settings(): Settings {
  const saved = Object.fromEntries(all<{ key: string; value: string }>('SELECT * FROM settings').map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULTS, ...saved };
}

export function updateSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!(key in DEFAULTS)) throw Object.assign(new Error(`configuração desconhecida: ${key}`), { status: 400 });
    if (typeof value !== typeof DEFAULTS[key as keyof Settings]) throw Object.assign(new Error(`tipo inválido para ${key}`), { status: 400 });
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
  publish('state.changed');
  return settings();
}
