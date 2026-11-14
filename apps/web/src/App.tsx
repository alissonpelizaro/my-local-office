import { useEffect } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { ConfigTab } from './components/ConfigTab';
import { CostsTab } from './components/CostsTab';
import { DeptModelDialog, HireDialog, NewDeptDialog } from './components/TeamDialogs';
import { Icon, type IconName } from './components/icons';
import { InboxDrawer } from './components/InboxDrawer';
import { LoadingScreen } from './components/LoadingScreen';
import { OfficeTab } from './components/OfficeTab';
import { SetupWizard } from './components/SetupWizard';
import { NewTaskModal, TasksTab } from './components/TasksTab';
import { Toasts } from './components/Toasts';
import { Button, cx, Kbd, Spinner } from './components/ui';
import { connect, openConfig, openNewTask, openTask, selectEmployee, setInbox, setPalette, setTab, setTheme, type Tab, type Theme, useOffice, useT } from './store';

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'office', icon: 'building' },
  { id: 'tasks', icon: 'list' },
  { id: 'costs', icon: 'chart' },
  { id: 'config', icon: 'sliders' },
];

export function App() {
  useEffect(() => connect(), []);
  // Atalhos globais: ⌘K abre a paleta, N nova tarefa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useOffice.getState().palette);
      } else if (!typing && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !useOffice.getState().setup) {
        e.preventDefault();
        const s = useOffice.getState();
        openNewTask(s.tab === 'office' ? (s.selectedEmployeeId ?? undefined) : undefined);
      } else if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]')) {
        const s = useOffice.getState();
        if (s.tab === 'office' && s.selectedEmployeeId != null) selectEmployee(null);
        else if (s.tab === 'tasks' && s.selectedTaskId != null) openTask(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const t = useT();
  const tab = useOffice((s) => s.tab);
  const offline = useOffice((s) => s.loaded && s.connectionLost);
  const loaded = useOffice((s) => s.loaded);
  const ready = useOffice((s) => s.loaded && s.officeReady);
  const updating = useOffice((s) => s.state.app.updating && s.state.app.latest);

  return (
    <>
      {/* A tela de carregamento cobre tudo até o estado chegar e a cena do escritório estar desenhada. */}
      <LoadingScreen done={ready} />
      {loaded && (
        <div className="flex h-full flex-col">
          <Header />
          {updating ? (
            <div className="flex animate-fade-in items-center justify-center gap-2 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
              <Spinner className="h-3.5 w-3.5" /> {t.app.updating(updating)}
            </div>
          ) : (
            offline && (
              <div className="flex animate-fade-in items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <Spinner className="h-3.5 w-3.5" /> {t.app.offline}
              </div>
            )
          )}
          <main className="relative min-h-0 flex-1">
            {/* O escritório fica montado (canvas WebGL não aceita 0×0) para a cena não reiniciar ao trocar de aba. */}
            <div className={cx('absolute inset-0', tab !== 'office' && 'invisible')} inert={tab !== 'office'}>
              <OfficeTab />
            </div>
            {tab === 'tasks' && (
              <Pane>
                <TasksTab />
              </Pane>
            )}
            {tab === 'costs' && (
              <Pane scroll>
                <CostsTab />
              </Pane>
            )}
            {tab === 'config' && (
              <Pane>
                <ConfigTab />
              </Pane>
            )}
          </main>
          <Toasts />
          <InboxDrawer />
          <CommandPalette />
          <NewTaskModal />
          <HireDialog />
          <NewDeptDialog />
          <DeptModelDialog />
          <SetupWizard />
        </div>
      )}
    </>
  );
}

const Pane = ({ children, scroll }: { children: React.ReactNode; scroll?: boolean }) => (
  <div className={cx('absolute inset-0 animate-fade-in bg-zinc-50 dark:bg-zinc-950', scroll && 'overflow-y-auto')}>{children}</div>
);

function Header() {
  const t = useT();
  const tab = useOffice((s) => s.tab);
  const connected = useOffice((s) => s.connected);
  const pending = useOffice((s) => s.state.approvals.length);
  const running = useOffice((s) => s.state.tasks.filter((t) => t.status === 'running').length);
  const update = useOffice((s) => (s.state.app.available && !s.state.app.updating ? s.state.app.latest : null));
  // Pedidos esperando aparecem na aba do navegador (e na barra de janelas), mesmo com o escritório em segundo plano.
  useEffect(() => {
    document.title = pending ? `(${pending}) My Local Office` : 'My Local Office';
  }, [pending]);

  return (
    <header className="flex items-center gap-3 border-b border-zinc-200/80 bg-white/80 px-3 py-2 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex items-center gap-2 pr-1 font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white shadow-sm">
          <Icon name="building" className="h-4 w-4" />
        </span>
        <span className="hidden sm:inline">My Local Office</span>
      </div>

      <nav className="flex items-center gap-0.5 rounded-xl bg-zinc-900/[0.04] p-1 dark:bg-white/[0.04]">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            title={t.app.tabs[x.id]}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition active:scale-95',
              tab === x.id ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-700/90 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            <Icon name={x.icon} className="h-4 w-4" />
            <span className="hidden md:inline">{t.app.tabs[x.id]}</span>
            {x.id === 'tasks' && running > 0 && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
          </button>
        ))}
      </nav>

      <button
        onClick={() => setPalette(true)}
        className="ml-1 hidden h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-400 transition hover:border-zinc-300 lg:flex dark:border-zinc-700/80 dark:bg-zinc-900"
      >
        <Icon name="search" className="h-3.5 w-3.5" />
        <span>{t.common.search}</span>
        <Kbd className="ml-6">⌘K</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {update && (
          <button
            onClick={() => openConfig('about')}
            title={t.app.updateAvailable(update)}
            className="inline-flex h-8 animate-pop items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-950"
          >
            <Icon name="update" className="h-4 w-4" />
            <span className="hidden sm:inline">v{update}</span>
          </button>
        )}
        <Button variant="primary" size="sm" icon="plus" onClick={() => openNewTask()} title={t.app.newTaskTitle}>
          <span className="hidden sm:inline">{t.app.newTask}</span>
        </Button>

        <button
          onClick={() => setInbox(true)}
          title={pending ? t.app.inboxPending(pending) : t.app.inbox}
          className={cx(
            'relative grid h-8 w-8 place-items-center rounded-lg transition active:scale-95',
            pending ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50' : 'text-zinc-500 hover:bg-zinc-900/5 dark:hover:bg-white/5',
          )}
        >
          <Icon name="bell" className={cx('h-4.5 w-4.5', pending > 0 && 'origin-top animate-wiggle')} />
          {pending > 0 && (
            <span key={pending} className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-zinc-950">
              {pending}
            </span>
          )}
        </button>

        <ThemeToggle />

        <span title={connected ? t.app.connected : t.app.reconnecting} className={cx('ml-0.5 h-2 w-2 rounded-full transition-colors', connected ? 'bg-emerald-500' : 'animate-pulse bg-amber-500')} />
      </div>
    </header>
  );
}

const THEME_CYCLE: Theme[] = ['light', 'dark', 'system'];
const THEME_ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' };

function ThemeToggle() {
  const t = useT();
  const theme = useOffice((s) => s.theme);
  return (
    <button
      onClick={() => setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length])}
      title={t.app.themeTitle(t.app.themes[theme])}
      className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-900/5 active:scale-90 dark:hover:bg-white/5"
    >
      <span key={theme} className="inline-grid animate-pop place-items-center">
        <Icon name={THEME_ICON[theme]} className="h-4.5 w-4.5" />
      </span>
    </button>
  );
}
