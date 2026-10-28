import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedByRule, isExternal, isInside, ruleFor } from './policy.ts';

test('isExternal: ações que saem da máquina', () => {
  for (const command of ['git push origin x', 'gh pr review 12 --approve', 'gh pr merge 3', 'docker compose up', 'pnpm publish', 'gh api repos/a/b -X POST']) {
    assert.equal(isExternal('Bash', { command }), true, command);
  }
  for (const command of ['git status', 'gh pr view 12', 'gh pr diff 3', 'pnpm test', 'gh api repos/a/b']) {
    assert.equal(isExternal('Bash', { command }), false, command);
  }
  assert.equal(isExternal('mcp__claude_ai_Gmail__send_message', {}), true);
  assert.equal(isExternal('mcp__claude_ai_Gmail__search_threads', {}), false);
  assert.equal(isExternal('mcp__office__delegate_task', {}), false);
  assert.equal(isExternal('Write', { file_path: 'x' }), false);
});

test('ruleFor e allowedByRule: prefixo de duas palavras, sem comandos compostos', () => {
  assert.equal(ruleFor('Bash', { command: '  pnpm test --filter api' }), 'Bash:pnpm test');
  assert.equal(ruleFor('WebFetch', { url: 'x' }), 'WebFetch');
  const rules = ['Bash:pnpm test', 'WebFetch'];
  assert.equal(allowedByRule(rules, 'Bash', { command: 'pnpm test' }), true);
  assert.equal(allowedByRule(rules, 'Bash', { command: 'pnpm test --filter api' }), true);
  assert.equal(allowedByRule(rules, 'Bash', { command: 'pnpm testx' }), false);
  assert.equal(allowedByRule(rules, 'Bash', { command: 'pnpm test && rm -rf /' }), false);
  assert.equal(allowedByRule(rules, 'Bash', { command: 'pnpm test $(whoami)' }), false);
  assert.equal(allowedByRule(rules, 'Bash', { command: 'pnpm test\nrm -rf /' }), false);
  assert.equal(allowedByRule(rules, 'WebFetch', {}), true);
  assert.equal(allowedByRule(rules, 'Write', {}), false);
});

test('isInside', () => {
  assert.equal(isInside('/r/repo', '/r/repo/a/b.ts'), true);
  assert.equal(isInside('/r/repo', 'a/b.ts'), true);
  assert.equal(isInside('/r/repo', '/r/repo'), true);
  assert.equal(isInside('/r/repo', '/r/repo-other/x'), false);
  assert.equal(isInside('/r/repo', '/r/repo/../x'), false);
});
