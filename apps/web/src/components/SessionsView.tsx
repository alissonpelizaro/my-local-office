import { useEffect, useState } from 'react';
import { ago, everyLabel, money, names, STATUS } from '../format';
import { api, openChat, toast, useOffice } from '../store';
import type { NativeSession, Thread } from '../types';
import { Chip, cx, Empty, Skeleton } from './ui';
import { Icon } from './icons';

export function SessionsView({ employeeId }: { employeeId: number }) {
  const state = useOffice((s) => s.state);
  const current = useOffice((s) => s.chat[employeeId]);
  const version = state.tasks.filter((t) => t.employee_id === employeeId).map((t) => `${t.id}${t.status}`).join();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [native, setNative] = useState<NativeSession[] | null>(null);
  const name = names(state);

  useEffect(() => {
    api<Thread[]>('GET', `/api/employees/${employeeId}/threads`).then(setThreads, (e) => toast(e.message));
  }, [employeeId, version]);
  useEffect(() => {
    api<NativeSession[]>('GET', `/api/employees/${employeeId}/sessions`).then(setNative, () => setNative([]));
  }, [employeeId]);

  return (
    <div className="grid gap-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Conversas</h3>
        <div className="grid gap-1.5">
          {threads === null && [0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          {threads?.map((t) => {
            const on = current?.kind === 'thread' && current.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => openChat(employeeId, { kind: 'thread', id: t.id })}
                className={cx(
                  'rounded-xl border p-2.5 text-left text-sm transition hover:-translate-y-px hover:shadow-sm',
                  on ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                  {t.repeatEvery ? (
                    <Chip tone="violet" icon="repeat">{everyLabel(t.repeatEvery)}</Chip>
                  ) : t.running ? (
                    <Chip tone="blue">ao vivo</Chip>
                  ) : (
                    <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
                  <span>{ago(t.updatedAt)}</span>
                  <span>· {t.turns} turno(s)</span>
                  {t.costUsd > 0 && <span>· {money(t.costUsd)}</span>}
                  {t.origin === 'agent' && <span>· de {name(t.fromEmployeeId)}</span>}
                  {t.worktree && <Icon name="branch" className="h-3 w-3" />}
                </div>
              </button>
            );
          })}
          {threads?.length === 0 && <Empty>Nenhuma conversa ainda.</Empty>}
        </div>
      </section>

      {native !== null && native.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Sessões do Claude Code</h3>
          <p className="mb-2 text-xs text-zinc-500">Abertas fora do escritório. Continuar cria uma cópia: a original não muda.</p>
          <div className="grid gap-1.5">
            {native.map((s) => (
              <div key={s.sessionId} className="rounded-xl border border-zinc-200 p-2.5 text-sm dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium" title={s.firstMessage}>{s.title}</span>
                  <button className="shrink-0 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => openChat(employeeId, { kind: 'native', sessionId: s.sessionId, title: s.title })}>
                    Continuar
                  </button>
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{ago(s.updatedAt)} · {s.firstMessage}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
