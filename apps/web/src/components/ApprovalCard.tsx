import { useState } from 'react';
import { act, api, useOffice } from '../store';
import type { Approval } from '../types';
import { Button, Chip, cx, Input } from './ui';

const decide = (id: number, decision: string, text?: string) => act(() => api('POST', `/api/approvals/${id}`, { decision, text }));

export function ApprovalCard({ approval: a }: { approval: Approval }) {
  const employee = useOffice((s) => s.state.employees.find((e) => e.id === a.employee_id));
  const [text, setText] = useState('');
  const [denying, setDenying] = useState(false);
  const who = employee?.name ?? 'escritório';

  return (
    <div className={cx('rounded-lg border-2 p-3 text-sm', a.kind === 'tool' && a.payload.external ? 'border-red-500 bg-red-50/60 dark:bg-red-950/30' : 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20')}>
      {a.kind === 'tool' && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <b>{who}</b> quer usar <b>{a.payload.tool}</b>
            {a.payload.external && <Chip tone="red">ação externa</Chip>}
            {a.payload.outsideRepo && <Chip tone="amber">fora do repo</Chip>}
            {a.task_id && <span className="text-xs text-zinc-500">task #{a.task_id}</span>}
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-900 p-2 font-mono text-xs whitespace-pre-wrap text-zinc-100 [overflow-wrap:anywhere]">{a.payload.summary}</pre>
          {denying ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                decide(a.id, 'deny', text);
              }}
            >
              <Input autoFocus placeholder="Motivo (o agente lê)" value={text} onChange={(e) => setText(e.target.value)} />
              <Button variant="danger">Negar</Button>
            </form>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => decide(a.id, 'allow')}>
                Permitir
              </Button>
              {!a.payload.external && (
                <Button title={`Regra: ${a.payload.rule}`} onClick={() => decide(a.id, 'always')}>
                  Sempre permitir
                </Button>
              )}
              <Button variant="danger" onClick={() => setDenying(true)}>
                Negar…
              </Button>
            </div>
          )}
        </>
      )}

      {a.kind === 'question' && (
        <>
          <div>
            <b>{who}</b> pergunta:
          </div>
          <p className="mt-1 whitespace-pre-wrap">{a.payload.question}</p>
          {a.payload.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {a.payload.options.map((o) => (
                <Button key={o} onClick={() => decide(a.id, 'answer', o)}>
                  {o}
                </Button>
              ))}
            </div>
          )}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) decide(a.id, 'answer', text);
            }}
          >
            <Input placeholder="Responder…" value={text} onChange={(e) => setText(e.target.value)} />
            <Button variant="primary">Enviar</Button>
          </form>
        </>
      )}

      {a.kind === 'delegation' && (
        <>
          <div>
            <b>{a.payload.from ?? '?'}</b> quer delegar a <b>{a.payload.to}</b>:
          </div>
          <p className="mt-1 font-medium">{a.payload.title}</p>
          {a.payload.body && <p className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{a.payload.body}</p>}
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => decide(a.id, 'allow')}>
              Aprovar task
            </Button>
            <Button variant="danger" onClick={() => decide(a.id, 'deny')}>
              Recusar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
