import { type ReactNode, useState } from 'react';
import { act, api, openChat, tr, useOffice, useT } from '../store';
import type { Approval, Question, QuestionPayload, ToolPayload } from '../types';
import { Icon, type IconName } from './icons';
import { Button, Chip, cx, Input, Rich } from './ui';

type Body = { decision: string; text?: string; answers?: Record<string, string> };

// Decisão otimista: o card sai animando na hora; se o servidor recusar, volta (o estado é recarregado).
function useDecide(id: number) {
  const [leaving, setLeaving] = useState(false);
  const decide = async (body: Body) => {
    setLeaving(true);
    if ((await act(() => api('POST', `/api/approvals/${id}`, body))) === undefined) setLeaving(false);
  };
  return { leaving, decide };
}

const leave = (leaving: boolean) => cx('transition duration-200 ease-out', leaving && 'pointer-events-none scale-[0.97] opacity-0');

export function ApprovalCard({ approval: a, compact = false }: { approval: Approval; compact?: boolean }) {
  const employee = useOffice((s) => s.state.employees.find((e) => e.id === a.employee_id));
  const thread = useOffice((s) => s.state.tasks.find((t) => t.id === a.task_id)?.thread_id);
  const who = employee?.name ?? tr().common.office;
  // Fora da conversa (gaveta, visão geral), dá para pular direto para ela.
  const open = !compact && employee && thread ? () => openChat(employee.id, { kind: 'thread', id: thread }) : undefined;
  if (a.kind === 'question') return <QuestionCard id={a.id} who={compact ? null : who} payload={a.payload} onOpen={open} />;
  if (a.kind === 'tool') return <ToolCard id={a.id} who={who} payload={a.payload} onOpen={open} />;
  return <DelegationCard id={a.id} payload={a.payload} />;
}

function Shell({ tone, icon, title, extra, onOpen, children, footer, leaving }: { tone: 'amber' | 'red' | 'blue'; icon: IconName; title: ReactNode; extra?: ReactNode; onOpen?: () => void; children?: ReactNode; footer: ReactNode; leaving: boolean }) {
  const tt = useT();
  const t = {
    amber: { box: 'border-amber-300/80 dark:border-amber-800/70', head: 'bg-amber-50 dark:bg-amber-950/30', icon: 'bg-amber-500' },
    red: { box: 'border-red-300 dark:border-red-900', head: 'bg-red-50 dark:bg-red-950/40', icon: 'bg-red-600' },
    blue: { box: 'border-blue-200 dark:border-blue-900/70', head: 'bg-blue-50 dark:bg-blue-950/30', icon: 'bg-blue-600' },
  }[tone];
  return (
    <div className={cx('animate-pop overflow-hidden rounded-2xl border bg-white text-sm shadow-sm dark:bg-zinc-900', t.box, leave(leaving))}>
      <div className={cx('flex flex-wrap items-center gap-2 px-3 py-2', t.head)}>
        <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-white', t.icon)}>
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">{title}</span>
        {extra}
        {onOpen && (
          <button onClick={onOpen} className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            {tt.approval.viewChat} <Icon name="chevronRight" className="h-3 w-3" />
          </button>
        )}
      </div>
      {children && <div className="grid gap-2 px-3 pt-3">{children}</div>}
      <div className="flex flex-wrap items-center gap-2 p-3">{footer}</div>
    </div>
  );
}

// ---------- delegação ----------

function DelegationCard({ id, payload: p }: { id: number; payload: Extract<Approval, { kind: 'delegation' }>['payload'] }) {
  const t = useT();
  const { leaving, decide } = useDecide(id);
  return (
    <Shell
      tone="amber"
      icon="arrowRight"
      leaving={leaving}
      title={<Rich text={t.approval.wantsDelegate(p.from ?? '?', p.to)} />}
      footer={
        <>
          <Button variant="primary" size="sm" icon="check" onClick={() => decide({ decision: 'allow' })}>
            {t.approval.approve}
          </Button>
          <Button variant="danger" size="sm" onClick={() => decide({ decision: 'deny' })}>
            {t.approval.decline}
          </Button>
        </>
      }
    >
      <p className="font-medium">{p.title}</p>
      {p.body && <p className="max-h-40 overflow-auto text-xs whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{p.body}</p>}
    </Shell>
  );
}

// ---------- permissão de ferramenta ----------

function headline(p: ToolPayload) {
  const t = tr().approval;
  const short = (f?: string) => f?.split('/').slice(-3).join('/');
  const mcp = p.tool.match(/^mcp__(.+?)__(.+)$/);
  if (p.tool === 'Bash') return t.runCommand;
  if (p.tool === 'Edit' || p.tool === 'MultiEdit') return t.editFile(short(p.detail?.file) ?? '');
  if (p.tool === 'Write') return t.writeFile(short(p.detail?.file) ?? '');
  if (p.tool === 'WebFetch') return t.fetch;
  if (mcp) return t.useMcp(mcp[2], mcp[1].replace(/^claude_ai_/, ''));
  return t.useTool(p.tool);
}

function Code({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'del' | 'add' }) {
  return (
    <pre
      className={cx(
        'max-h-48 overflow-auto rounded-lg p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]',
        tone === 'del' ? 'bg-red-950/90 text-red-100' : tone === 'add' ? 'bg-emerald-950/90 text-emerald-100' : 'bg-zinc-900 text-zinc-100 dark:bg-black/60',
      )}
    >
      {children}
    </pre>
  );
}

function ToolCard({ id, who, payload: p, onOpen }: { id: number; who: string; payload: ToolPayload; onOpen?: () => void }) {
  const t = useT();
  const { leaving, decide } = useDecide(id);
  const [text, setText] = useState('');
  const [denying, setDenying] = useState(false);
  const d = p.detail;
  return (
    <Shell
      tone={p.external ? 'red' : 'amber'}
      icon={p.external ? 'alert' : 'lock'}
      leaving={leaving}
      onOpen={onOpen}
      title={
        <>
          <b>{who}</b> {headline(p)}
        </>
      }
      extra={
        <>
          {p.external && <Chip tone="red">{t.approval.leavesMachine}</Chip>}
          {p.outsideRepo && <Chip tone="amber">{t.approval.outsideRepo}</Chip>}
        </>
      }
      footer={
        denying ? (
          <form
            className="flex w-full animate-fade-in gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              decide({ decision: 'deny', text });
            }}
          >
            <Input autoFocus placeholder={t.approval.why} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setDenying(false))} />
            <Button type="submit" variant="solidDanger" size="md">
              {t.approval.deny}
            </Button>
          </form>
        ) : (
          <>
            <Button variant="primary" size="sm" icon="check" onClick={() => decide({ decision: 'allow' })}>
              {t.approval.allow}
            </Button>
            {!p.external && p.rules?.length > 0 && (
              <Button size="sm" title={t.approval.alwaysTitle(p.rules.join(', '))} onClick={() => decide({ decision: 'always' })}>
                {t.approval.alwaysAllow}
              </Button>
            )}
            <Button variant="danger" size="sm" className="ml-auto" onClick={() => setDenying(true)}>
              {t.approval.denyDots}
            </Button>
          </>
        )
      }
    >
      {d?.description && <p className="text-zinc-700 dark:text-zinc-300">{d.description}</p>}
      {d?.command && <Code>{d.command}</Code>}
      {d?.url && <code className="text-xs [overflow-wrap:anywhere]">{d.url}</code>}
      {d?.before && <Code tone="del">{d.before}</Code>}
      {d?.after && <Code tone={d.before ? 'add' : 'plain'}>{d.after}</Code>}
      {!d && <Code>{p.summary}</Code>}
    </Shell>
  );
}

// ---------- pergunta do agente ----------

export function QuestionCard({ id, who, payload, onOpen }: { id: number; who: string | null; payload: QuestionPayload; onOpen?: () => void }) {
  const t = useT();
  const { leaving, decide } = useDecide(id);
  const questions: Question[] = payload.questions?.length ? payload.questions : [{ question: payload.question, options: payload.options.map((label) => ({ label })) }];
  const structured = !!payload.questions?.length;
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const answerOf = (q: Question) => other[q.question]?.trim() || (picked[q.question] ?? []).join(', ');
  const complete = questions.every((q) => answerOf(q));
  const single = questions.length === 1 && !questions[0].multiSelect;

  const submit = (answers: Record<string, string>) =>
    structured ? decide({ decision: 'answer', answers }) : decide({ decision: 'answer', text: Object.values(answers)[0] });

  return (
    <Shell
      tone="blue"
      icon="message"
      leaving={leaving}
      onOpen={onOpen}
      title={who ? <Rich text={t.approval.asks(who)} /> : t.approval.questionForYou}
      footer={
        <>
          {(!single || Object.values(other).some((v) => v.trim())) && (
            <Button variant="primary" size="sm" disabled={!complete} onClick={() => submit(Object.fromEntries(questions.map((q) => [q.question, answerOf(q)])))}>
              {t.approval.answer}
            </Button>
          )}
          <button className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200" onClick={() => decide({ decision: 'deny' })}>
            {t.approval.answerInChat}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        {questions.map((q) => {
          const chosen = picked[q.question] ?? [];
          return (
            <div key={q.question} className="grid gap-2">
              {q.header && (
                <Chip tone="blue" className="justify-self-start">
                  {q.header}
                </Chip>
              )}
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
                      'group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition duration-150 hover:-translate-y-px active:scale-[0.99]',
                      on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:bg-blue-950/50' : 'border-zinc-200 bg-white hover:border-blue-400 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900',
                    )}
                  >
                    <span
                      className={cx(
                        'mt-0.5 grid h-4 w-4 shrink-0 place-items-center border transition',
                        q.multiSelect ? 'rounded' : 'rounded-full',
                        on ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 group-hover:border-blue-400 dark:border-zinc-600',
                      )}
                    >
                      {on && <Icon name="check" className="h-3 w-3 animate-pop" />}
                    </span>
                    <span>
                      <span className="block font-medium">{o.label}</span>
                      {o.description && <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">{o.description}</span>}
                    </span>
                  </button>
                );
              })}
              <Input
                placeholder={q.options?.length ? t.approval.otherAnswer : t.approval.yourAnswer}
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
    </Shell>
  );
}
