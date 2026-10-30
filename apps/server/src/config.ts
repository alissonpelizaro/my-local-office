export const PORT = Number(process.env.OFFICE_PORT) || 4410;
export const CLAUDE_BIN = process.env.OFFICE_CLAUDE_BIN ?? 'claude';
export const MAX_CONCURRENT = Number(process.env.OFFICE_MAX_CONCURRENT) || 3;
export const DELEGATION_NEEDS_APPROVAL = process.env.OFFICE_DELEGATION_APPROVAL !== '0';
export const MAX_CONSULT_DEPTH = 2;
export const CONSULT_TIMEOUT_MS = 30 * 60_000;
export const PRECHECK_TIMEOUT_MS = 2 * 60_000;
