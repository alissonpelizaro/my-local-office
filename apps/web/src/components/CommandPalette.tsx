import { useEffect, useMemo, useRef, useState } from 'react';
import { names } from '../format';
import { openChat, openConfig, openNewTask, openTask, openTasks, setInbox, setPalette, setTab, setTheme, useOffice } from '../store';
import { Avatar, cx, Kbd, Modal } from './ui';
import { Icon, type IconName } from './icons';

type Cmd = { id: string; label: string; hint?: string; icon: IconName; node?: React.ReactNode; run: () => void };

export function CommandPalette() {
  const open = useOffice((s) => s.palette);
  const state = useOffice((s) => s.state);
  const name = names(state);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const go = (fn: () => void) => () => {
      setPalette(false);
      fn();
    };
    const color = (id: number) => state.departments.find((d) => d.id === state.employees.find((e) => e.id === id)?.department_id)?.color ?? '#999';
    return [
      { id: 'new', label: 'Nova tarefa', hint: 'N', icon: 'plus', run: go(() => openNewTask()) },
      { id: 'inbox', label: 'Abrir pedidos', icon: 'bell', run: go(() => setInbox(true)) },
      { id: 'office', label: 'Ir para o Escritório', icon: 'building', run: go(() => setTab('office')) },
      { id: 'tasks', label: 'Tarefas ativas', icon: 'list', run: go(() => openTasks('active')) },
      { id: 'planned', label: 'Tarefas planejadas', icon: 'calendar', run: go(() => openTasks('planned')) },
      { id: 'costs', label: 'Ver custos', icon: 'chart', run: go(() => setTab('costs')) },
      { id: 'team', label: 'Gerenciar equipe', icon: 'users', run: go(() => openConfig('team')) },
      { id: 'import', label: 'Importar repositórios', icon: 'download', run: go(() => openConfig('import')) },
      { id: 'theme-dark', label: 'Tema escuro', icon: 'moon', run: go(() => setTheme('dark')) },
      { id: 'theme-light', label: 'Tema claro', icon: 'sun', run: go(() => setTheme('light')) },
      ...state.employees.map(
        (e): Cmd => ({
          id: `emp-${e.id}`,
          label: e.name,
          hint: 'conversa',
          icon: 'message',
          node: <Avatar name={e.name} color={color(e.id)} size="sm" activity={e.activity} />,
          run: go(() => openChat(e.id, { kind: 'new' })),
        }),
      ),
      // Série aparece uma vez (a execução mais recente).
      ...state.tasks
        .filter((t, i, all) => !t.repeat_every || all.findIndex((x) => x.thread_id === t.thread_id) === i)
        .slice(0, 40)
        .map((t): Cmd => ({ id: `task-${t.id}`, label: t.title, hint: `#${t.id} · ${name(t.employee_id)}`, icon: t.repeat_every ? 'repeat' : 'list', run: go(() => openTask(t.id)) })),
    ];
  }, [state, name]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands.slice(0, 8);
    return commands.filter((c) => (c.label + (c.hint ?? '')).toLowerCase().includes(s)).slice(0, 12);
  }, [q, commands]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Modal open={open} onClose={() => setPalette(false)} kind="top" className="w-[min(600px,100vw-2rem)]">
      <div
        className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, filtered.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          else if (e.key === 'Enter') (e.preventDefault(), filtered[active]?.run());
        }}
      >
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800">
          <Icon name="search" className="h-4.5 w-4.5 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar funcionário, tarefa ou ação…"
            className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">Nada encontrado.</p>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              data-active={i === active}
              onMouseMove={() => setActive(i)}
              onClick={c.run}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                i === active ? 'bg-blue-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
              )}
            >
              {c.node ?? <Icon name={c.icon} className={cx('h-4.5 w-4.5', i === active ? 'text-white' : 'text-zinc-400')} />}
              <span className="flex-1 truncate">{c.label}</span>
              {c.hint && <span className={cx('truncate text-xs', i === active ? 'text-white/70' : 'text-zinc-400')}>{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
