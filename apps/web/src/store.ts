import { create } from 'zustand';
import { DICTS, isLang, type Lang } from './i18n';
import type { ChatTarget, Models, OfficeEvent, OfficeState, Task } from './types';

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? r.statusText);
  return data as T;
}

export type Tab = 'office' | 'tasks' | 'costs' | 'config';
export type PanelTab = 'chat' | 'history' | 'settings';
export type TaskView = 'active' | 'planned' | 'history';
export type ConfigSection = 'team' | 'import' | 'providers' | 'office' | 'about';
export type Theme = 'light' | 'dark' | 'system';
type Toast = { id: number; text: string; tone: 'error' | 'info' | 'success'; action?: { label: string; run: () => void }; leaving?: boolean };

// localStorage pode lançar (modo privado, dados bloqueados): o app funciona sem ele.
const stored = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const store = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const resolveDark = (t: Theme) => t === 'dark' || (t === 'system' && prefersDark.matches);
const storedTheme = ((): Theme => {
  const t = stored('theme');
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
})();
document.documentElement.classList.toggle('dark', resolveDark(storedTheme));
prefersDark.addEventListener('change', () => {
  if (get().theme === 'system') setTheme('system');
});
// Idioma salvo localmente só para a tela de carregamento; o que vale é o da Configuração (servidor).
const storedLang = ((): Lang => {
  const l = stored('lang');
  return isLang(l) ? l : 'en';
})();
document.documentElement.lang = storedLang;

type Store = {
  state: OfficeState;
  loaded: boolean;
  loadFailed: boolean;
  officeReady: boolean; // cena do escritório desenhada (a tela de carregamento espera por ela)
  lang: Lang;
  setup: boolean; // assistente de configuração aberto
  hire: { departmentId?: number } | null; // diálogo de contratação
  newDept: boolean;
  deptModel: number | null; // diálogo de modelo do departamento
  connected: boolean;
  connectionLost: boolean; // a SSE caiu (ou nunca abriu por erro): só então avisa que está offline
  events: OfficeEvent[];
  tab: Tab;
  theme: Theme;
  dark: boolean;
  selectedEmployeeId: number | null;
  selectedTaskId: number | null;
  replay: { taskId: number; total: number; index: number } | null;
  toasts: Toast[];
  panelTab: PanelTab;
  chat: Record<number, ChatTarget>; // conversa aberta por funcionário
  models: Models | null;
  newTask: { employeeId?: number; task?: Task } | null; // modal de nova tarefa (ou edição de `task`) aberto
  inbox: boolean;
  palette: boolean;
  taskView: TaskView | null; // null: escolhe pela situação ao abrir
  configSection: ConfigSection | null;
};

const EMPTY: OfficeState = {
  departments: [],
  employees: [],
  providers: [],
  tasks: [],
  approvals: [],
  app: { version: '', latest: null, releaseUrl: null, checkedAt: null, canUpdate: false, updating: false, error: null, available: false },
  settings: {
    maxConcurrent: 3,
    delegationNeedsApproval: true,
    defaultModel: 'sonnet',
    onboardModel: 'haiku',
    consultModel: 'sonnet',
    defaultEffort: '',
    compactWindow: 200_000,
    language: storedLang,
    onboardingDone: true,
    importRoot: '~',
    notifyApprovals: true,
    notifyTaskFinished: true,
    autoAllowReadOnly: true,
    onlyAskExternal: true,
    profileRefreshCommits: 40,
  },
};

export const useOffice = create<Store>(() => ({
  state: EMPTY,
  loaded: false,
  loadFailed: false,
  officeReady: false,
  lang: storedLang,
  setup: false,
  hire: null,
  newDept: false,
  deptModel: null,
  connected: false,
  connectionLost: false,
  events: [],
  tab: 'office',
  theme: storedTheme,
  dark: resolveDark(storedTheme),
  selectedEmployeeId: null,
  selectedTaskId: null,
  replay: null,
  toasts: [],
  panelTab: 'chat',
  chat: {},
  models: null,
  newTask: null,
  inbox: false,
  palette: false,
  taskView: null,
  configSection: null,
}));
const set = useOffice.setState;
const get = useOffice.getState;

export const setTab = (tab: Tab) => set({ tab });
export const selectEmployee = (id: number | null) => set({ selectedEmployeeId: id, tab: 'office' });
export const openTask = (id: number | null) => set({ selectedTaskId: id, tab: 'tasks' });
export const setPanelTab = (panelTab: PanelTab) => set({ panelTab });
export const openTasks = (taskView: TaskView) => set({ taskView, tab: 'tasks' });
export const openConfig = (configSection: ConfigSection) => set({ configSection, tab: 'config' });
export const openNewTask = (employeeId?: number) => set({ newTask: { employeeId }, palette: false });
export const openEditTask = (task: Task) => set({ newTask: { employeeId: task.employee_id, task }, palette: false });
export const closeNewTask = () => set({ newTask: null });
export const setInbox = (inbox: boolean) => set({ inbox, palette: false });
export const setPalette = (palette: boolean) => set({ palette });
export const setOfficeReady = () => set({ officeReady: true });
export const openSetup = (setup = true) => set({ setup, palette: false });
export const openHire = (departmentId?: number) => set({ hire: { departmentId }, palette: false });
export const closeHire = () => set({ hire: null });
export const openNewDept = (newDept = true) => set({ newDept, palette: false });
export const openDeptModel = (deptModel: number | null) => set({ deptModel });

// Dicionário do idioma ativo: useT() nos componentes, tr() fora do React (toasts, cena, formatação).
export const useT = () => DICTS[useOffice((s) => s.lang)];
export const tr = () => DICTS[get().lang];

function applyLang(lang: Lang) {
  store('lang', lang);
  document.documentElement.lang = lang;
  if (get().lang !== lang) set({ lang });
}
export async function setLanguage(lang: Lang) {
  applyLang(lang);
  await act(() => api('PATCH', '/api/settings', { language: lang }));
}

export function setTheme(theme: Theme) {
  store('theme', theme);
  const dark = resolveDark(theme);
  const swap = () => {
    document.documentElement.classList.toggle('dark', dark);
    set({ theme, dark });
  };
  // Cross-fade da troca inteira (inclusive o canvas) em vez de cada cor mudar no seu tempo.
  if (dark !== get().dark && 'startViewTransition' in document) document.startViewTransition(swap);
  else swap();
}
export const openChat = (employeeId: number, target: ChatTarget) =>
  set((s) => ({ chat: { ...s.chat, [employeeId]: target }, selectedEmployeeId: employeeId, panelTab: 'chat', tab: 'office', inbox: false, palette: false }));

export const TOAST_MS = 6000;
let toastId = 0;
export function dismissToast(id: number) {
  set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 220);
}
export function toast(text: string, tone: Toast['tone'] = 'error', action?: Toast['action']) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone, action }] }));
  setTimeout(() => dismissToast(id), TOAST_MS);
}

// Versão do servidor quando a página abriu: mudou (atualização terminou), recarrega para pegar a UI nova.
let bootVersion: string | null = null;

export async function refresh() {
  try {
    const state = await api<OfficeState>('GET', '/api/state');
    bootVersion ??= state.app.version;
    if (state.app.version !== bootVersion) return location.reload();
    if (isLang(state.settings.language)) applyLang(state.settings.language);
    set({ state, loaded: true, loadFailed: false });
  } catch (e) {
    set({ loadFailed: true });
    if (get().loaded) toast(tr().common.loadStateFailed((e as Error).message));
  }
}
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
export function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 120);
}

// Executa uma ação da UI: erro vira toast e o estado é recarregado.
export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const r = await fn();
    refreshSoon();
    return r;
  } catch (e) {
    toast((e as Error).message);
  }
}

// ---------- eventos para o Office View ----------

type Listener = (e: OfficeEvent, replay: boolean) => void;
const listeners = new Set<Listener>();
export function onOfficeEvent(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const emit = (e: OfficeEvent, replay: boolean) => listeners.forEach((fn) => fn(e, replay));
export const marker = (type: string, taskId: number): OfficeEvent => ({ id: 0, ts: new Date().toISOString(), type, employeeId: null, taskId, data: null });

// Eventos que não mudam nada fora do log não precisam recarregar o estado.
const QUIET = new Set(['agent.text', 'agent.tool', 'agent.compact', 'run.started', 'agent.activity']);

// O server testa os modelos ao subir (leva alguns segundos): enquanto não terminou, pergunta de novo.
let modelsTimer: ReturnType<typeof setTimeout> | undefined;
export async function loadModels(force = false) {
  clearTimeout(modelsTimer);
  try {
    const models = await api<Models>(force ? 'POST' : 'GET', force ? '/api/models/refresh' : '/api/models');
    set({ models });
    if (!models.probedAt) modelsTimer = setTimeout(loadModels, 8000);
  } catch (e) {
    if (force) toast((e as Error).message);
  }
}

export function connect() {
  // O estado já via HTTP, sem esperar a SSE abrir: a tela de carregamento resolve o mais rápido possível
  // e não fica presa num spinner infinito quando o servidor está fora.
  void refresh();
  const es = new EventSource('/api/events');
  let openedAt = Date.now();
  es.onopen = () => {
    openedAt = Date.now();
    set({ connected: true, connectionLost: false });
    loadModels();
  };
  es.onerror = () => set({ connected: false, connectionLost: true });
  es.onmessage = (m) => {
    const e: OfficeEvent = JSON.parse(m.data);
    const s = get();
    if ((s.events.at(-1)?.id ?? 0) >= e.id) return;
    const patch: Partial<Store> = { events: [...s.events.slice(-1499), e] };
    if (e.type === 'agent.activity' && e.employeeId != null) {
      patch.state = { ...s.state, employees: s.state.employees.map((x) => (x.id === e.employeeId ? { ...x, activity: e.data.activity } : x)) };
    }
    set(patch);
    if (!QUIET.has(e.type)) refreshSoon();
    // O backlog enviado ao conectar vai para o log, mas não é animado.
    if (!s.replay && Date.parse(e.ts) >= openedAt - 1500) emit(e, false);
  };
  return () => es.close();
}

// ---------- replay de task ----------

let replayTimer: ReturnType<typeof setTimeout> | undefined;

export async function startReplay(taskId: number) {
  stopReplay();
  const events = await api<OfficeEvent[]>('GET', `/api/tasks/${taskId}/events`).catch((e) => (toast(e.message), []));
  if (!events.length) return toast(tr().log.empty, 'info');
  set({ replay: { taskId, total: events.length, index: 0 }, tab: 'office' });
  emit(marker('replay.start', taskId), true);
  let i = 0;
  const step = () => {
    if (get().replay?.taskId !== taskId) return;
    emit(events[i], true);
    set({ replay: { taskId, total: events.length, index: i + 1 } });
    if (++i >= events.length) {
      replayTimer = setTimeout(stopReplay, 3000);
      return;
    }
    // Ritmo real, comprimido: pausas longas (aprovação, modelo pensando) viram no máximo 1,4 s.
    const gap = Date.parse(events[i].ts) - Date.parse(events[i - 1].ts);
    replayTimer = setTimeout(step, Math.min(Math.max(gap, 150), 1400));
  };
  replayTimer = setTimeout(step, 500);
}

export function stopReplay() {
  clearTimeout(replayTimer);
  const r = get().replay;
  if (!r) return;
  set({ replay: null });
  emit(marker('replay.end', r.taskId), true);
}
