import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedByRule, isDestructive, isExternal, isInside, isReadOnlyCommand, rulesFor } from './policy.ts';

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
    'gh search prs --review-requested=@me --state=open --json number,title,url',
    'rtk gh pr list --state open -R alissonpelizaro/my-local-office 2>/dev/null || echo "GH_TOKEN_REQUIRED"',
    "gh api /user/repos | jq '.[] | .name'",
    "gh api graphql -F 'query=query($login: String!){ viewer { login } }' 2>/dev/null",
    'gh api search/issues -X GET -f q=is:pr',
    'cd apps/api && ls',
    'cd /r/repo/apps && cat package.json; echo rc=$?',
    'grep -v "renewal.spec\\|referrals.spec" log.txt',
    // o que colegas consultados mais tentavam e era negado
    'git -C /r/repo log --oneline -3; git --no-pager show HEAD --stat',
    'git fetch -q origin 2>&1 | tail -1; git log --oneline origin/main -8',
    'git fetch --tags origin',
    "git branch -a --list '*68*'",
    'git branch --contains 27f315a',
    "git tag -l 'v1.6*'",
    'git tag --sort=-v:refname --points-at HEAD',
    'git merge-base HEAD origin/main; git rev-list --count v1.6.4..HEAD',
    "sed -n '434,458p;582,600p' api/helper.py",
    'git show origin/main:a.py | cat -n | sed -n 1,60p',
    "git ls-tree -r --name-only v1 lib | sed 's#lib/##'",
    'rtk proxy git log -3',
    'echo "=== a"\ngit log -1\n\ngit status |\n  head -3',
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
    'cd && cat .ssh/id_rsa',
    'cd - && ls',
    'cd ~ && ls',
    'cd ../outro && ls',
    'echo "\\$(id)" $(id)',
    'echo "$HOME"',
    'FOO=1 ls',
    'ls\nrm x',
    'node script.js',
    'sed -i s/a/b/ x',
    'grep "unterminated',
    'gh pr merge 3',
    'gh pr checkout 3',
    'gh repo delete x',
    'gh auth token',
    'gh api repos/a/b/pulls/1/reviews -f event=APPROVE',
    "gh api graphql -f 'query=mutation { x }'",
    'gh api graphql -F query=@q.graphql',
    'gh api repos/a/b --input body.json',
    'gh api repos/a/b --method=DELETE',
    'git -C ~/x log',
    'git -C /r/repo -c core.pager=sh log',
    'git -c alias.x=!sh x',
    'git fetch origin pull/1/head:pr1',
    'git fetch --upload-pack=touch origin',
    'git ls-remote --upload-pack=sh origin',
    'git fetch -u origin',
    'git fetch --depth=1 origin',
    'git fetch --prune --prune-tags origin',
    'git branch -D x',
    'git branch -a nova',
    'git tag -d v1',
    'git tag -a v2 -m x',
    "sed -n '1p;w out' f",
    "sed 's/a/b/w out' f",
    "sed 's/a/b/e' f",
    "sed -n 1,5p /etc/passwd",
    "sed -n -i 1p f",
    'rtk proxy rm x',
  ]) {
    assert.equal(isReadOnlyCommand(cmd, cwd), false, cmd);
  }
});

test('isDestructive: descarta trabalho, mexe no sistema ou apaga fora da pasta', () => {
  const cwd = '/r/repo';
  for (const command of [
    'git reset --hard origin/main',
    'git clean -fd',
    'git checkout -- .',
    'cd /tmp/x && rtk git checkout master -- src/ && pytest',
    'git checkout .',
    'git restore src/a.ts',
    'git stash drop',
    'launchctl kickstart -k gui/501/local.my-local-office',
    'systemctl --user stop x',
    'pkill -f "pytest"',
    'kill 123',
    'sudo ls',
    'psql "$DB" -c "DELETE FROM users WHERE id = 1"',
    "sqlite3 data.db 'update tasks set status = 1'",
    'find . -name "*.pyc" -delete',
    'rm -rf src',
    'rm -rf ~/x',
    'rm -rf /tmp',
    'rm -rf /tmp/*',
    'rm -rf /tmp/../etc',
    'rm -rf "$W"',
    'cd sub && rm -rf build',
    'cd ~ && rm x',
    'cd && rm x',
    'ls | xargs rm -f',
    'rm /etc/hosts',
    'rm ../outro/x',
  ]) {
    assert.equal(isDestructive('Bash', { command }, cwd), true, command);
  }
  for (const command of [
    'pnpm test',
    'uv run pytest -q',
    'git checkout -b feat/x',
    'git checkout main',
    'git checkout pr-71 2>&1 | tail -2',
    'git branch -d merged',
    'git stash pop',
    'git reset --soft HEAD~1',
    'git commit -m "remove x" && git log -1',
    'grep -rn "rm -rf" .',
    'psql -c "SELECT * FROM users"',
    'rm -rf /tmp/pr86 && git worktree add /tmp/pr86 pr-86',
    'cd /tmp && rm -rf kb-pr194 && mkdir kb-pr194',
    'cd /tmp/dta-events-pr65 && rm -rf .venv && uv venv .venv',
    'rm -f /tmp/a.json /tmp/b.json; echo cleaned',
    'rm -rf /var/folders/y4/1f9795/T/tmp.98rLUTOycB',
    'rm src/old.ts',
    'git rm src/old.ts',
    'git branch -D pr-86',
    'launchctl list | grep office; systemctl --user status x',
    'set -e\nM=/tmp/seo-mine; rm -rf $M; mkdir -p $M/blog',
    'W=/tmp/w; cd "$W"; rm -rf w164 w165',
  ]) {
    assert.equal(isDestructive('Bash', { command }, cwd), false, command);
  }
  assert.equal(isDestructive('Write', { file_path: '/etc/x' }, cwd), false);
});

test('isExternal: ações que saem da máquina', () => {
  for (const command of [
    'git push origin x',
    'gh pr review 12 --approve',
    'gh pr merge 3',
    'docker compose up',
    'pnpm publish',
    'gh api repos/a/b -X POST',
    'gh api repos/a/b --method=DELETE',
    'rtk gh api repos/a/b/pulls/1/reviews -f event=APPROVE',
    "gh api graphql -f query='mutation { x }'",
  ]) {
    assert.equal(isExternal('Bash', { command }), true, command);
  }
  for (const command of ['git status', 'gh pr view 12', 'gh pr diff 3', 'pnpm test', 'gh api repos/a/b', "gh api graphql -f query='query { viewer { login } }'"]) {
    assert.equal(isExternal('Bash', { command }), false, command);
  }
  assert.equal(isExternal('mcp__claude_ai_Gmail__send_message', {}), true);
  assert.equal(isExternal('mcp__claude_ai_Gmail__search_threads', {}), false);
  assert.equal(isExternal('mcp__office__delegate_task', {}), false);
  assert.equal(isExternal('Write', { file_path: 'x' }), false);
});

test('rulesFor e allowedByRule: prefixo de duas palavras, cada trecho do composto coberto', () => {
  const rulesFor_ = (command: string, rules: string[] = []) => rulesFor(rules, 'Bash', { command }, '/r/repo');
  assert.deepEqual(rulesFor_('  pnpm test --filter api'), ['Bash:pnpm test']);
  assert.deepEqual(rulesFor_('rtk uv run pytest -q'), ['Bash:uv run']);
  assert.deepEqual(rulesFor(['x'], 'WebFetch', { url: 'x' }, '/r/repo'), ['WebFetch']);
  // Composto: só os trechos que ainda pediriam permissão, sem `cd` para dentro do repo nem leitura.
  const composite = 'cd /r/repo && npx tsc --noEmit 2>&1 | grep -v "a.spec\\|b.spec" | head; pnpm build 2>&1 | tail -3; echo tsc=$?';
  assert.deepEqual(rulesFor_(composite), ['Bash:npx tsc', 'Bash:pnpm build']);
  assert.deepEqual(rulesFor_(composite, ['Bash:npx tsc']), ['Bash:pnpm build']);
  assert.equal(allowedByRule(['Bash:npx tsc', 'Bash:pnpm build'], 'Bash', { command: composite }, '/r/repo'), true);
  assert.deepEqual(rulesFor_('echo $(whoami)'), []);
  const rules = ['Bash:pnpm test', 'Bash:rtk uv run', 'WebFetch'];
  const allowed = (command: string) => allowedByRule(rules, 'Bash', { command }, '/r/repo');
  assert.equal(allowed('pnpm test'), true);
  assert.equal(allowed('pnpm test --filter api'), true);
  assert.equal(allowed('rtk pnpm test 2>&1 | tail -30'), true);
  assert.equal(allowed('uv run pytest -q'), true);
  assert.equal(allowed('pnpm testx'), false);
  assert.equal(allowed('pnpm test && rm -rf /'), false);
  assert.equal(allowed('pnpm test | xargs rm'), false);
  assert.equal(allowed('pnpm test > out.txt'), false);
  assert.equal(allowed('pnpm test $(whoami)'), false);
  assert.equal(allowed('pnpm test\nrm -rf /'), false);
  assert.equal(allowedByRule(['Bash:rtk'], 'Bash', { command: 'rm -rf /' }, '/r/repo'), false);
  assert.equal(allowedByRule(rules, 'WebFetch', {}, '/r/repo'), true);
  assert.equal(allowedByRule(rules, 'Write', {}, '/r/repo'), false);
});

test('isInside', () => {
  assert.equal(isInside('/r/repo', '/r/repo/a/b.ts'), true);
  assert.equal(isInside('/r/repo', 'a/b.ts'), true);
  assert.equal(isInside('/r/repo', '/r/repo'), true);
  assert.equal(isInside('/r/repo', '/r/repo-other/x'), false);
  assert.equal(isInside('/r/repo', '/r/repo/../x'), false);
});
