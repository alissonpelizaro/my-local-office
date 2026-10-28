import { PORT } from './config.ts';
import type { Provider } from './db.ts';

// Variáveis que redirecionam o Claude Code; removidas no modo nativo para não herdar um remoto do shell.
const ANTHROPIC_VARS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
];

// Mesmo esquema do local-llm-hub: todos os aliases (opus/sonnet/haiku/subagentes) viram o modelo do provedor.
// Token nunca vazio, senão o Claude Code mandaria o login da Anthropic para o provedor.
function remoteEnv(p: Provider) {
  const viaBridge = p.format === 'openai';
  return {
    ANTHROPIC_BASE_URL: viaBridge ? `http://127.0.0.1:${PORT}/bridge/${p.id}` : p.base_url.replace(/\/+$/, ''),
    ANTHROPIC_AUTH_TOKEN: viaBridge ? 'office' : p.api_key || 'none',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: p.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: p.model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: p.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: p.small_model || p.model,
    CLAUDE_CODE_SUBAGENT_MODEL: p.model,
  };
}

export function childEnv(provider: Provider | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ANTHROPIC_VARS) delete env[k];
  return {
    ...env,
    ...(provider && remoteEnv(provider)),
    // Aprovação humana pode levar horas; o permission prompt é uma chamada MCP bloqueante.
    MCP_TOOL_TIMEOUT: String(24 * 3600_000),
  };
}

export const publicProvider = ({ api_key, ...p }: Provider) => ({ ...p, has_key: Boolean(api_key) });
