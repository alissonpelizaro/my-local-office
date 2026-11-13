// Espelho do que apps/server expõe em /api/state e /api/events.
export type Activity = 'idle' | 'thinking' | 'reading' | 'typing' | 'running' | 'talking' | 'consulting' | 'delegating' | 'waiting' | 'onboarding';

export type Department = { id: number; name: string; color: string; kind: 'repo' | 'communications' };

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
  allow_rules: string[];
  isolation: 'repo' | 'worktree';
  max_parallel: number;
  profile_source: 'auto' | 'manual';
  connectors: number;
  kind: 'repo' | 'intern';
  activity: Activity;
};

export type Provider = {
  id: number;
  name: string;
  format: 'anthropic' | 'openai';
  base_url: string;
  model: string;
  small_model: string | null;
  context_window: number | null;
  max_parallel: number;
  has_key: boolean;
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
  thread_id: number;
  resume_session_id: string | null;
  run_at: string | null;
  repeat_every: number | null; // minutos
  precheck: string | null;
};

export type Thread = {
  id: number;
  title: string;
  origin: Task['origin'];
  fromEmployeeId: number | null;
  turns: number;
  status: TaskStatus;
  running: boolean;
  costUsd: number;
  updatedAt: string;
  worktree: string | null;
  resumedSession: string | null;
  repeatEvery: number | null; // série recorrente ainda ativa
};

export type ThreadDetail = { id: number; employeeId: number; title: string; tasks: Task[]; events: OfficeEvent[]; hiddenTurns: number };

export type NativeSession = { sessionId: string; title: string; firstMessage: string; updatedAt: string };

export type ModelInfo = { id: string; status: 'ok' | 'update' | 'unavailable'; requires?: string; note?: string };
export type Models = { cli: string | null; aliases: { alias: string; model: string | null }[]; models: ModelInfo[]; probedAt: string | null };

export type ChatTarget = { kind: 'new' } | { kind: 'thread'; id: number } | { kind: 'native'; sessionId: string; title: string };

export type ToolDetail = { description?: string; command?: string; file?: string; before?: string; after?: string; url?: string };
export type ToolPayload = { tool: string; input: unknown; summary: string; detail?: ToolDetail; external: boolean; destructive?: boolean; outsideRepo: boolean; rules: string[] };
// questions: pergunta estruturada do Claude Code (AskUserQuestion); sem ela, pergunta simples (ask_boss).
export type Question = { question: string; header?: string; options?: { label: string; description?: string }[]; multiSelect?: boolean };
export type QuestionPayload = { question: string; options: string[]; questions?: Question[] };
export type DelegationPayload = { taskId: number; from: string | null; to: string; title: string; body: string };

type ApprovalBase = { id: number; employee_id: number | null; task_id: number | null; status: string; created_at: string };
export type Approval = ApprovalBase &
  ({ kind: 'tool'; payload: ToolPayload } | { kind: 'question'; payload: QuestionPayload } | { kind: 'delegation'; payload: DelegationPayload });

export type Settings = {
  language: string;
  onboardingDone: boolean;
  maxConcurrent: number;
  delegationNeedsApproval: boolean;
  defaultModel: string;
  onboardModel: string;
  consultModel: string;
  defaultEffort: string;
  compactWindow: number;
  importRoot: string;
  notifyApprovals: boolean;
  notifyTaskFinished: boolean;
  autoAllowReadOnly: boolean;
  onlyAskExternal: boolean;
  profileRefreshCommits: number;
};

export type Costs = {
  days: number;
  total: number;
  byEmployee: { employeeId: number | null; name: string; departmentId: number | null; byKind: Record<string, number>; total: number; runs: number }[];
  byDepartment: { departmentId: number | null; total: number }[];
  byDay: { day: string; total: number }[];
};

export type AppInfo = {
  version: string;
  latest: string | null;
  releaseUrl: string | null;
  checkedAt: string | null;
  canUpdate: boolean;
  updating: boolean;
  error: string | null;
  available: boolean;
};

export type OfficeState = {
  app: AppInfo;
  departments: Department[];
  employees: Employee[];
  providers: Provider[];
  tasks: Task[];
  approvals: Approval[];
  settings: Settings;
};

export type OfficeEvent = {
  id: number;
  ts: string;
  type: string;
  employeeId: number | null;
  taskId: number | null;
  data: any;
};

export type DiscoveredRepo = {
  repoPath: string;
  name: string;
  remote: string | null;
  org: string | null;
  employedAs: string | null;
  duplicateOf: string | null;
  suggestedDepartment: string;
};
