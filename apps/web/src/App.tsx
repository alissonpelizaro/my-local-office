import { useEffect } from 'react';
import { ConfigTab } from './components/ConfigTab';
import { CostsTab } from './components/CostsTab';
import { OfficeTab } from './components/OfficeTab';
import { TasksTab } from './components/TasksTab';
import { cx } from './components/ui';
import { connect, selectEmployee, setTab, type Tab, useOffice } from './store';

const TABS: { id: Tab; label: string }[] = [
  { id: 'office', label: '🏢 Escritório' },
  { id: 'tasks', label: '📋 Tasks' },
  { id: 'costs', label: '📊 Custos' },
  { id: 'config', label: '⚙️ Configuração' },
];

export function App() {
  useEffect(() => connect(), []);
  const tab = useOffice((s) => s.tab);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="relative min-h-0 flex-1">
        {/* O escritório fica montado (e com tamanho: canvas WebGL não aceita 0×0) para a cena não reiniciar ao trocar de aba. */}
        <div className={cx('absolute inset-0', tab !== 'office' && 'invisible')}>
          <OfficeTab />
        </div>
        {tab === 'tasks' && (
          <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-950">
            <TasksTab />
          </div>
        )}
        {tab === 'costs' && (
          <div className="absolute inset-0 overflow-y-auto bg-zinc-100 dark:bg-zinc-950">
            <CostsTab />
          </div>
        )}
        {tab === 'config' && (
          <div className="absolute inset-0 overflow-y-auto bg-zinc-100 dark:bg-zinc-950">
            <ConfigTab />
          </div>
        )}
      </main>
      <Toasts />
    </div>
  );
}

function Header() {
  const tab = useOffice((s) => s.tab);
  const connected = useOffice((s) => s.connected);
  const pending = useOffice((s) => s.state.approvals.length);
  const running = useOffice((s) => s.state.tasks.filter((t) => t.status === 'running').length);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <h1 className="font-semibold">My Local Office</h1>
      <nav className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'rounded-md px-3 py-1.5 text-sm',
              tab === t.id ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        {running > 0 && <span className="text-zinc-500">{running} em execução</span>}
        <button
          onClick={() => selectEmployee(null)}
          className={cx('rounded-full px-3 py-1 font-medium', pending ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800')}
        >
          {pending ? `❗ ${pending} pedido(s)` : 'Nenhum pedido'}
        </button>
        <span className="flex items-center gap-1.5 text-xs text-zinc-500" title={connected ? 'Conectado ao servidor' : 'Reconectando…'}>
          <span className={cx('h-2 w-2 rounded-full', connected ? 'bg-green-500' : 'bg-amber-500')} />
          {connected ? 'ao vivo' : 'offline'}
        </span>
      </div>
    </header>
  );
}

function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 grid max-w-sm gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cx('rounded-lg px-3 py-2 text-sm text-white shadow-lg', t.tone === 'error' ? 'bg-red-600' : 'bg-zinc-800')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
