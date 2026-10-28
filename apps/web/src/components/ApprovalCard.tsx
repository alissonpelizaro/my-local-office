import { useState } from 'react';
import { act, api, useOffice } from '../store';
import type { Approval, Question, QuestionPayload, ToolPayload } from '../types';
import { Button, Chip, cx, Input } from './ui';

const decide = (id: number, body: { decision: string; text?: string; answers?: Record<string, string> }) => act(() => api('POST', `/api/approvals/${id}`, body));

export function ApprovalCard({ approval: a, compact = false }: { approval: Approval; compact?: boolean }) {
  const employee = useOffice((s) => s.state.employees.find((e) => e.id === a.employee_id));
  const who = employee?.name ?? 'escritório';
  if (a.kind === 'question') return <QuestionCard id={a.id} who={compact ? null : who} payload={a.payload} />;
  if (a.kind === 'tool') return <ToolCard id={a.id} who={who} payload={a.payload} taskId={compact ? null : a.task_id} />;
  return (
    <div className="rounded-lg border-2 border-amber-400 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20">
      <div>
        <b>{a.payload.from ?? '?'}</b> quer delegar a <b>{a.payload.to}</b>:
      </div>
      <p className="mt-1 font-medium">{a.payload.title}</p>
      {a.payload.body && <p className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{a.payload.body}</p>}
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={() => decide(a.id, { decision: 'allow' })}>
          Aprovar task
        </Button>
        <Button variant="danger" onClick={() => decide(a.id, { decision: 'deny' })}>
          Recusar
        </Button>
      </div>
    </div>
  );
}

// ---------- permissão de ferramenta ----------

function headline(p: ToolPayload) {
  const short = (f?: string) => f?.split('/').slice(-3).join('/');
  const mcp = p.tool.match(/^mcp__(.+?)__(.+)$/);
  if (p.tool === 'Bash') return 'quer rodar um comando';
  if (p.tool === 'Edit' || p.tool === 'MultiEdit') return `quer editar ${short(p.detail?.file)}`;
  if (p.tool === 'Write') return `quer escrever ${short(p.detail?.file)}`;
  if (p.tool === 'WebFetch') return 'quer acessar uma página';
  if (mcp) return `quer usar ${mcp[2]} (${mcp[1].replace(/^claude_ai_/, '')})`;
  return `quer usar ${p.tool}`;
}

function Code({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'del' | 'add' }) {
  return (
    <pre
      className={cx(
        'max-h-48 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]',
        tone === 'del' ? 'bg-red-950/90 text-red-100' : tone === 'add' ? 'bg-emerald-950/90 text-emerald-100' : 'bg-zinc-900 text-zinc-100',
      )}
    >
      {children}
    </pre>
  );
}

function ToolCard({ id, who, payload: p, taskId }: { id: number; who: string; payload: ToolPayload; taskId: number | null }) {
  const [text, setText] = useState('');
  const [denying, setDenying] = useState(false);
  const d = p.detail;
  return (
    <div className={cx('rounded-xl border-2 p-3 text-sm', p.external ? 'border-red-500 bg-red-50/60 dark:bg-red-950/30' : 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span>
          🔐 <b>{who}</b> {headline(p)}
        </span>
        {p.external && <Chip tone="red">sai da sua máquina</Chip>}
        {p.outsideRepo && <Chip tone="amber">fora do repo</Chip>}
        {taskId && <span className="text-xs text-zinc-500">task #{taskId}</span>}
      </div>
      <div className="mt-2 grid gap-1.5">
        {d?.description && <p className="text-zinc-700 dark:text-zinc-300">{d.description}</p>}
        {d?.command && <Code>{d.command}</Code>}
        {d?.url && <code className="text-xs [overflow-wrap:anywhere]">{d.url}</code>}
        {d?.before && <Code tone="del">{d.before}</Code>}
        {d?.after && <Code tone={d.before ? 'add' : 'plain'}>{d.after}</Code>}
        {!d && <Code>{p.summary}</Code>}
      </div>
      {denying ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            decide(id, { decision: 'deny', text });
          }}
        >
          <Input autoFocus placeholder="Por quê? (o agente lê e ajusta)" value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="danger">Negar</Button>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => decide(id, { decision: 'allow' })}>
            Permitir
          </Button>
          {!p.external && (
            <Button title={`Libera sempre para este funcionário: ${p.rule}`} onClick={() => decide(id, { decision: 'always' })}>
              Sempre permitir
            </Button>
          )}
          <Button variant="danger" onClick={() => setDenying(true)}>
            Negar…
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- pergunta do agente ----------

export function QuestionCard({ id, who, payload }: { id: number; who: string | null; payload: QuestionPayload }) {
  const questions: Question[] = payload.questions?.length ? payload.questions : [{ question: payload.question, options: payload.options.map((label) => ({ label })) }];
  const structured = !!payload.questions?.length;
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const answerOf = (q: Question) => other[q.question]?.trim() || (picked[q.question] ?? []).join(', ');
  const complete = questions.every((q) => answerOf(q));
  const single = questions.length === 1 && !questions[0].multiSelect;

  const submit = (answers: Record<string, string>) =>
    structured ? decide(id, { decision: 'answer', answers }) : decide(id, { decision: 'answer', text: Object.values(answers)[0] });

  return (
    <div className="rounded-2xl rounded-tl-sm border border-blue-300 bg-blue-50/70 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
      {who && (
        <div className="mb-1 text-xs text-zinc-500">
          ❓ <b>{who}</b> pergunta
        </div>
      )}
      <div className="grid gap-3">
        {questions.map((q) => {
          const chosen = picked[q.question] ?? [];
          return (
            <div key={q.question} className="grid gap-1.5">
              {q.header && <Chip tone="blue" className="justify-self-start">{q.header}</Chip>}
              <p className="font-medium whitespace-pre-wrap">{q.question}</p>
              {(q.options ?? []).map((o) => {
                const on = chosen.includes(o.label);
                return (
                  <button
                    key={o.label}
                    onClick={() => {
                      if (single) return submit({ [q.question]: o.label });
                      setPicked((p) => ({ ...p, [q.question]: q.multiSelect ? (on ? chosen.filter((l) => l !== o.label) : [...chosen, o.label]) : [o.label] }));
                    }}
                    className={cx(
                      'rounded-lg border px-3 py-2 text-left transition',
                      on ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/50' : 'border-zinc-300 bg-white hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900',
                    )}
                  >
                    <div className="font-medium">
                      {q.multiSelect && (on ? '☑ ' : '☐ ')}
                      {o.label}
                    </div>
                    {o.description && <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{o.description}</div>}
                  </button>
                );
              })}
              <Input
                placeholder={q.options?.length ? 'Outra resposta…' : 'Sua resposta…'}
                value={other[q.question] ?? ''}
                onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && single && answerOf(q)) submit({ [q.question]: answerOf(q) });
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(!single || Object.values(other).some((v) => v.trim())) && (
          <Button variant="primary" disabled={!complete} onClick={() => submit(Object.fromEntries(questions.map((q) => [q.question, answerOf(q)])))}>
            Responder
          </Button>
        )}
        <button className="text-xs text-zinc-500 hover:underline" onClick={() => decide(id, { decision: 'deny' })}>
          Prefiro responder pela conversa
        </button>
      </div>
    </div>
  );
}
