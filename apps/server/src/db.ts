import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

// Instalação pelo install.sh: o app é trocado a cada versão, os dados ficam ao lado ($MLO_HOME/data).
export const DATA = process.env.OFFICE_DATA ?? (process.env.MLO_HOME ? path.join(process.env.MLO_HOME, 'data') : path.resolve(import.meta.dirname, '../../../data'));
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
// Anexos do chat: os funcionários leem daqui (o runner passa a pasta em --add-dir).
export const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true, mode: 0o700 });

export const db = new DatabaseSync(path.join(DATA, 'office.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6b7280',
    kind TEXT NOT NULL DEFAULT 'repo' CHECK (kind IN ('repo', 'communications'))
  );

  CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    format TEXT NOT NULL CHECK (format IN ('anthropic', 'openai')),
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    small_model TEXT
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL UNIQUE,
    repo_path TEXT NOT NULL,
    git_remote TEXT,
    profile TEXT NOT NULL DEFAULT '',
    provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
    model TEXT,
    auto_edit INTEGER NOT NULL DEFAULT 0,
    allow_rules TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    origin TEXT NOT NULL CHECK (origin IN ('user', 'agent', 'comms')),
    from_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    result TEXT,
    cost_usd REAL NOT NULL DEFAULT 0,
    session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('tool', 'delegation', 'question')),
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    answer TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
    decided_at TEXT
  );

  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    employee_name TEXT NOT NULL,
    department_id INTEGER,
    task_id INTEGER,
    kind TEXT NOT NULL,
    model TEXT,
    cost_usd REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS usage_ts ON usage (ts);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    employee_id INTEGER,
    task_id INTEGER,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_task ON events (task_id);

  -- Tokens de acesso externo (rede, túnel): só o hash; o token aparece uma vez, ao criar.
  CREATE TABLE IF NOT EXISTS access_tokens (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );
`);

// Migrações aditivas: colunas novas em bancos criados por versões anteriores.
function addColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumn('employees', 'isolation', `TEXT NOT NULL DEFAULT 'repo'`);
addColumn('employees', 'max_parallel', 'INTEGER NOT NULL DEFAULT 1');
addColumn('employees', 'profile_source', `TEXT NOT NULL DEFAULT 'auto'`);
addColumn('employees', 'profile_commit', 'TEXT');
addColumn('tasks', 'worktree', 'TEXT');
addColumn('tasks', 'worktree_base', 'TEXT');
addColumn('tasks', 'thread_id', 'INTEGER'); // conversa: a task raiz e as continuações dela
addColumn('tasks', 'resume_session_id', 'TEXT'); // sessão do Claude Code (de fora do escritório) a retomar
addColumn('tasks', 'cwd', 'TEXT'); // pasta onde o turno rodou: a sessão do Claude fica guardada por pasta
addColumn('tasks', 'run_at', 'TEXT'); // agendada: só entra na fila a partir deste instante (ISO UTC)
addColumn('tasks', 'repeat_every', 'INTEGER'); // minutos; a série inteira divide a mesma conversa
addColumn('usage', 'session_id', 'TEXT');
addColumn('employees', 'effort', 'TEXT');
addColumn('providers', 'context_window', 'INTEGER'); // tokens que o modelo aguenta (ex. num_ctx do Ollama)
addColumn('providers', 'max_parallel', 'INTEGER NOT NULL DEFAULT 1'); // tasks simultâneas do provedor (nativo = sem teto)
addColumn('employees', 'connectors', 'INTEGER NOT NULL DEFAULT 0'); // carrega conectores claude.ai e MCPs do usuário/projeto nas tasks
addColumn('tasks', 'precheck', 'TEXT'); // comando que decide se a task precisa do agente (vazio = nada a fazer)
addColumn('employees', 'kind', `TEXT NOT NULL DEFAULT 'repo'`); // repo | intern (sem repositório, trabalha numa pasta própria)
db.exec('CREATE INDEX IF NOT EXISTS tasks_thread ON tasks (thread_id)');

// Tasks anteriores às conversas: continuação do mesmo funcionário herda a conversa da origem.
{
  const rows = db.prepare('SELECT id, employee_id, parent_task_id FROM tasks WHERE thread_id IS NULL ORDER BY id').all() as { id: number; employee_id: number; parent_task_id: number | null }[];
  const threadOf = new Map<number, { employee: number; thread: number }>();
  const update = db.prepare('UPDATE tasks SET thread_id = ? WHERE id = ?');
  for (const t of rows) {
    const parent = t.parent_task_id ? (threadOf.get(t.parent_task_id) ?? (db.prepare('SELECT employee_id AS employee, thread_id AS thread FROM tasks WHERE id = ?').get(t.parent_task_id) as { employee: number; thread: number } | undefined)) : undefined;
    const thread = parent && parent.employee === t.employee_id && parent.thread ? parent.thread : t.id;
    threadOf.set(t.id, { employee: t.employee_id, thread });
    update.run(thread, t.id);
  }
}

export type Department = { id: number; name: string; color: string; kind: 'repo' | 'communications' };
export type Provider = {
  id: number;
  name: string;
  format: 'anthropic' | 'openai';
  base_url: string;
  api_key: string;
  model: string;
  small_model: string | null;
  context_window: number | null;
  max_parallel: number;
};
export type Employee = {
  id: number;
  department_id: number;
  name: string;
  repo_path: string;
  git_remote: string | null;
  profile: string;
  provider_id: number | null;
  model: string | null;
  effort: string | null;
  auto_edit: number;
  allow_rules: string;
  isolation: 'repo' | 'worktree';
  max_parallel: number;
  profile_source: 'auto' | 'manual';
  profile_commit: string | null;
  connectors: number;
  kind: 'repo' | 'intern';
};
export type TaskStatus = 'scheduled' | 'paused' | 'pending_approval' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type Task = {
  id: number;
  employee_id: number;
  origin: 'user' | 'agent' | 'comms';
  from_employee_id: number | null;
  parent_task_id: number | null;
  title: string;
  body: string;
  status: TaskStatus;
  result: string | null;
  cost_usd: number;
  session_id: string | null;
  created_at: string;
  finished_at: string | null;
  worktree: string | null;
  worktree_base: string | null;
  thread_id: number;
  resume_session_id: string | null;
  cwd: string | null;
  run_at: string | null;
  repeat_every: number | null;
  precheck: string | null;
};
export type Approval = {
  id: number;
  employee_id: number | null;
  task_id: number | null;
  kind: 'tool' | 'delegation' | 'question';
  payload: string;
  status: 'pending' | 'allowed' | 'denied' | 'answered' | 'expired';
  answer: string | null;
  created_at: string;
  decided_at: string | null;
};

export const all = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as T[];
export const get = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as T | undefined;
export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

// Processos e esperas não sobrevivem a um restart: o que ficou pendurado é encerrado.
run(`UPDATE tasks SET status = 'failed', result = 'Interrupted: the server restarted', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE status = 'running'`);
run(`UPDATE approvals SET status = 'expired' WHERE status = 'pending' AND kind != 'delegation'`);
