import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedByRule, isExternal, isInside, isReadOnlyCommand, ruleFor } from './policy.ts';

test('isReadOnlyCommand: exploração local liberada', () => {
  const cwd = '/r/repo';
  for (const cmd of [
    'git ls-files | grep -v dist | head -80 && rtk wc -l apps/server/src/*.ts && cat package.json | head -30',
    'ls -la',
    'git log --oneline -20',
    'git status 2>&1',
    'rg "foo|bar" src',
    "grep -rn 'a && b' .",
    'find . -name "*.ts" -not -path "*/node_modules/*"',
    'cat /r/repo/README.md 2>/dev/null; echo ---; git branch -a',
    'git diff HEAD~1 -- src',
    'git remote -v',
  ]) {
    assert.equal(isReadOnlyCommand(cmd, cwd), true, cmd);
  }
});

test('isReadOnlyCommand: qualquer dúvida pede permissão', () => {
  const cwd = '/r/repo';
  for (const cmd of [
    'rm -rf x',
    'ls > out.txt',
    'cat a >> b',
    'echo $(whoami)',
    'echo `id`',
    'cat $HOME/.ssh/id_rsa',
    'cat ~/.ssh/id_rsa',
    'cat /etc/passwd',
    'cat ../outro/segredo',
    'find . -name x -exec rm {} ;',
    'find . -delete',
    'sort -o arquivo a',
    'rg --pre ./script x',
    'git push',
    'git commit -m x',
    'git branch nova',
    'git checkout main',
    'git -C /outro log',
    'git tag v1',
    'git diff --output=/tmp/x',
    'xargs rm',
    'cd / && cat etc/passwd',
    'FOO=1 ls',
    'ls\nrm x',
    'node script.js',
    'sed -i s/a/b/ x',
    'grep "unterminated',
  ]) {
    assert.equal(isReadOnlyCommand(cmd, cwd), false, cmd);
  }
});

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
