import { create } from 'zustand';
import type { ChatTarget, Models, OfficeEvent, OfficeState } from './types';

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
export type ConfigSection = 'team' | 'import' | 'providers' | 'office';
export type Theme = 'light' | 'dark' | 'system';
type Toast = { id: number; text: string; tone: 'error' | 'info' | 'success'; action?: { label: string; run: () => void }; leaving?: boolean };

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const resolveDark = (t: Theme) => t === 'dark' || (t === 'system' && prefersDark.matches);
const storedTheme = ((): Theme => {
  const t = localStorage.getItem('theme');
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
})();
document.documentElement.classList.toggle('dark', resolveDark(storedTheme));
prefersDark.addEventListener('change', () => {
  if (get().theme === 'system') setTheme('system');
});

type Store = {
  state: OfficeState;
  loaded: boolean;
  connected: boolean;
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
  newTask: { employeeId?: number } | null; // modal de nova tarefa aberto
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
  settings: {
    maxConcurrent: 3,
    delegationNeedsApproval: true,
    defaultModel: 'sonnet',
    onboardModel: 'haiku',
    importRoot: '~/webprojects',
    notifyApprovals: true,
    notifyTaskFinished: true,
    autoAllowReadOnly: true,
    profileRefreshCommits: 40,
  },
};

export const useOffice = create<Store>(() => ({
  state: EMPTY,
  loaded: false,
  connected: false,
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
export const closeNewTask = () => set({ newTask: null });
export const setInbox = (inbox: boolean) => set({ inbox, palette: false });
export const setPalette = (palette: boolean) => set({ palette });

export function setTheme(theme: Theme) {
  localStorage.setItem('theme', theme);
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

export async function refresh() {
  try {
    set({ state: await api<OfficeState>('GET', '/api/state'), loaded: true });
  } catch (e) {
    toast(`Falha ao carregar estado: ${(e as Error).message}`);
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
const marker = (type: string, taskId: number): OfficeEvent => ({ id: 0, ts: new Date().toISOString(), type, employeeId: null, taskId, data: null });

// Eventos que não mudam nada fora do log não precisam recarregar o estado.
const QUIET = new Set(['agent.text', 'agent.tool', 'run.started', 'agent.activity']);

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
  const es = new EventSource('/api/events');
  let openedAt = Date.now();
  es.onopen = () => {
    openedAt = Date.now();
    set({ connected: true });
    refresh();
    loadModels();
  };
  es.onerror = () => set({ connected: false });
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
  if (!events.length) return toast('Task sem eventos para assistir.', 'info');
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
