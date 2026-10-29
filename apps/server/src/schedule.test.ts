import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextRun } from './schedule.ts';

const MIN = 60_000;

test('próxima execução mantém o ritmo da âncora e pula horários perdidos', () => {
  const t0 = Date.parse('2026-01-01T12:00:00Z');
  assert.equal(nextRun(t0, 15, t0), t0 + 15 * MIN);
  assert.equal(nextRun(t0, 15, t0 + 3 * MIN), t0 + 15 * MIN);
  assert.equal(nextRun(t0, 15, t0 + 15 * MIN), t0 + 30 * MIN);
  assert.equal(nextRun(t0, 15, t0 + 50 * MIN), t0 + 60 * MIN);
  assert.equal(nextRun(t0, 15, t0 - 5 * MIN), t0 + 15 * MIN);
});
