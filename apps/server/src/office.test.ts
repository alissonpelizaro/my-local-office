import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.OFFICE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'office-test-'));
const { get, run } = await import('./db.ts');
const office = await import('./office.ts');

// Sem slots: nada da fila chega a rodar um agente.
run(`INSERT INTO settings (key, value) VALUES ('maxConcurrent', '0')`);
run(`INSERT INTO departments (id, name) VALUES (1, 'd')`);
run(`INSERT INTO employees (id, department_id, name, repo_path) VALUES (1, 1, 'e', '/tmp')`);

const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const task = (id: number | bigint) => get<any>('SELECT * FROM tasks WHERE id = ?', id)!;

test('edita tarefa agendada: texto, horário e vira série', () => {
  const t = office.createTask({ employeeId: 1, title: 'a', body: 'a', runAt: later(60) });
  const u = office.updateTask(t.id, { title: 'b', body: 'b\nmais', runAt: later(30) });
  assert.equal(u.status, 'scheduled');
  assert.equal(u.body, 'b\nmais');
  assert.ok(Date.parse(u.run_at!) < Date.parse(t.run_at!));

  // Série começando agora: entra na fila e já deixa a próxima agendada na mesma conversa.
  const s = office.updateTask(t.id, { title: 'b', body: 'b', repeatEvery: 15, precheck: ' true ' });
  assert.equal(s.status, 'queued');
  assert.equal(s.precheck, 'true');
  const next = get<any>(`SELECT * FROM tasks WHERE thread_id = ? AND id != ? AND status = 'scheduled'`, t.thread_id, t.id);
  assert.equal(next?.repeat_every, 15);
});

test('série pausada continua pausada', () => {
  const t = office.createTask({ employeeId: 1, title: 'a', runAt: later(60), repeatEvery: 60 });
  office.pauseTask(t.id, true);
  const u = office.updateTask(t.id, { title: 'a', repeatEvery: 30, runAt: later(10) });
  assert.equal(u.status, 'paused');
  assert.equal(u.repeat_every, 30);
});

test('recusa o que já começou ou execução de série na fila', () => {
  const t = office.createTask({ employeeId: 1, title: 'a', runAt: later(60) });
  run(`UPDATE tasks SET status = 'running' WHERE id = ?`, t.id);
  assert.throws(() => office.updateTask(t.id, { title: 'x' }), { status: 409 });
  const s = office.createTask({ employeeId: 1, title: 'a', repeatEvery: 15 });
  assert.equal(task(s.id).status, 'queued');
  assert.throws(() => office.updateTask(s.id, { title: 'x' }), { status: 409 });
  assert.throws(() => office.updateTask(999, { title: 'x' }), { status: 409 });
});

test('estagiário: sem repo, pasta própria, sem worktree nem onboarding', () => {
  const e = office.createEmployee({ kind: 'intern', name: 'Ana', departmentId: 1, profile: 'Pesquisa' });
  assert.equal(e.kind, 'intern');
  assert.equal(e.git_remote, null);
  assert.ok(fs.existsSync(e.repo_path));
  assert.throws(() => office.onboard(e.id), { status: 400 });
  const u = office.updateEmployee(e.id, { isolation: 'worktree', maxParallel: 3 })!;
  assert.equal(u.isolation, 'repo');
  assert.equal(u.max_parallel, 1);
  assert.throws(() => office.createEmployee({ kind: 'intern', name: 'ana', departmentId: 1 }), { status: 409 });
  assert.throws(() => office.createEmployee({ kind: 'intern', name: 'Bia', departmentId: 99 }), { status: 404 });
  assert.match(office.directory(), /Ana \(intern/);
});

test('troca provedor e modelo do departamento inteiro', () => {
  run(`INSERT INTO providers (id, name, format, base_url, model) VALUES (7, 'p', 'openai', 'http://x', 'm')`);
  const { updated } = office.setDepartmentModel(1, { providerId: 7, model: 'opus' });
  assert.ok(updated >= 2);
  assert.equal(get<any>('SELECT COUNT(*) AS n FROM employees WHERE department_id = 1 AND (provider_id != 7 OR model != ?)', 'opus').n, 0);
  office.setDepartmentModel(1, { providerId: null, model: '' });
  assert.equal(get<any>('SELECT COUNT(*) AS n FROM employees WHERE provider_id IS NOT NULL OR model IS NOT NULL').n, 0);
  assert.throws(() => office.setDepartmentModel(1, { providerId: 999 }), { status: 404 });
});
