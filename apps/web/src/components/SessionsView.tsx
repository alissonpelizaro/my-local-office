import { useEffect, useState } from 'react';
import { money, names, STATUS } from '../format';
import { api, openChat, toast, useOffice } from '../store';
import type { Employee, NativeSession, Thread } from '../types';
import { Chip, Empty } from './ui';

const ago = (ts: string) => {
  const m = Math.round((Date.now() - Date.parse(ts)) / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 48 * 60) return `há ${Math.round(m / 60)} h`;
  return new Date(ts).toLocaleDateString('pt-BR');
};

export function SessionsView({ employee }: { employee: Employee }) {
  const state = useOffice((s) => s.state);
  const current = useOffice((s) => s.chat[employee.id]);
  // Recarrega quando um turno deste funcionário termina ou começa.
  const version = state.tasks.filter((t) => t.employee_id === employee.id).map((t) => `${t.id}${t.status}`).join();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [native, setNative] = useState<NativeSession[] | null>(null);
  const name = names(state);

  useEffect(() => {
    api<Thread[]>('GET', `/api/employees/${employee.id}/threads`).then(setThreads, (e) => toast(e.message));
  }, [employee.id, version]);
  useEffect(() => {
    api<NativeSession[]>('GET', `/api/employees/${employee.id}/sessions`).then(setNative, () => setNative([]));
  }, [employee.id]);

  return (
    <div className="grid gap-5 overflow-y-auto">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Conversas no escritório</h3>
        <div className="grid gap-1.5">
          {threads?.map((t) => (
            <button
              key={t.id}
              onClick={() => openChat(employee.id, { kind: 'thread', id: t.id })}
              className={`rounded-lg border p-2 text-left text-sm hover:border-blue-400 ${current?.kind === 'thread' && current.id === t.id ? 'border-blue-500' : 'border-zinc-200 dark:border-zinc-800'}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                {t.running ? <Chip tone="blue">ao vivo</Chip> : <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {ago(t.updatedAt)} · {t.turns} turno(s) · {money(t.costUsd)}
                {t.origin === 'agent' && ` · de ${name(t.fromEmployeeId)}`}
                {t.resumedSession && ' · retomada do Claude Code'}
                {t.worktree && ' · 🌿'}
              </div>
            </button>
          ))}
          {threads?.length === 0 && <Empty>Nenhuma conversa ainda.</Empty>}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Sessões do Claude Code neste repo</h3>
        <p className="mb-2 text-xs text-zinc-500">Abertas fora do escritório (terminal, VS Code). Continuar cria uma cópia: a sessão original não muda.</p>
        <div className="grid gap-1.5">
          {native?.map((s) => (
            <div key={s.sessionId} className="rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium" title={s.firstMessage}>
                  {s.title}
                </span>
                <button className="text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => openChat(employee.id, { kind: 'native', sessionId: s.sessionId, title: s.title })}>
                  Continuar
                </button>
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                {ago(s.updatedAt)} · {s.firstMessage}
              </div>
            </div>
          ))}
          {native?.length === 0 && <Empty>Nenhuma sessão encontrada para {employee.repo_path}.</Empty>}
          {native === null && <Empty>Procurando…</Empty>}
        </div>
      </section>
    </div>
  );
}
