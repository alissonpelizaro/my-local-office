// Assistente do primeiro acesso: idioma, quem faz o trabalho (assinatura do Claude ou um provedor), departamentos
// e contratações. Abre sozinho com o escritório vazio e pode ser reaberto pela Configuração.
import { useEffect, useState } from 'react';
import { LANG_LABEL, LANGS } from '../i18n';
import { act, api, openSetup, setLanguage, setTab, toast, useOffice, useT } from '../store';
import type { Employee } from '../types';
import { BLANK, OLLAMA, ProviderForm, RepoImporter } from './ConfigTab';
import { Icon, type IconName } from './icons';
import { ColorPicker, KindCard, PALETTE } from './TeamDialogs';
import { Avatar, Button, cx, Dot, Field, Input, Select, Spinner, Textarea } from './ui';

const STEPS = ['welcome', 'provider', 'departments', 'team', 'done'] as const;
type Step = (typeof STEPS)[number];

export function SetupWizard() {
  const open = useOffice((s) => s.setup);
  const firstRun = useOffice((s) => s.loaded && !s.state.settings.onboardingDone && !s.state.departments.length && !s.state.employees.length);
  const [step, setStep] = useState<Step>('welcome');
  // Escritório vazio no primeiro acesso: abre sozinho (e fica aberto mesmo depois de criar o primeiro departamento).
  useEffect(() => {
    if (firstRun) openSetup(true);
  }, [firstRun]);
  useEffect(() => {
    if (open) setStep('welcome');
  }, [open]);
  if (!open) return null;

  // Quem ficou sem ficha (onboarding falhou antes de haver provedor) tenta de novo agora.
  const finish = async () => {
    openSetup(false);
    setTab('office');
    if (useOffice.getState().state.employees.some((e) => e.kind === 'repo' && !e.profile)) void act(() => api('POST', '/api/employees/onboard-pending'));
    if (!useOffice.getState().state.settings.onboardingDone) await act(() => api('PATCH', '/api/settings', { onboardingDone: true }));
  };
  const i = STEPS.indexOf(step);
  const go = (d: number) => setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, i + d))]);

  return (
    // m-auto num contêiner rolável: centraliza quando cabe e rola desde o topo quando o passo é mais alto que a tela.
    <div className="fixed inset-0 z-50 flex animate-fade-in overflow-y-auto bg-zinc-950/50 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal className="m-auto w-full max-w-2xl animate-pop overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <Progress index={i} onSkip={finish} />
        <div key={step} className="animate-rise p-6 sm:p-8">
          {step === 'welcome' && <Welcome onNext={() => go(1)} />}
          {step === 'provider' && <ProviderStep onBack={() => go(-1)} onNext={() => go(1)} />}
          {step === 'departments' && <Departments onBack={() => go(-1)} onNext={() => go(1)} />}
          {step === 'team' && <Team onBack={() => go(-1)} onNext={() => go(1)} />}
          {step === 'done' && <Done onFinish={finish} />}
        </div>
      </div>
    </div>
  );
}

function Progress({ index, onSkip }: { index: number; onSkip: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
      <div className="flex flex-1 items-center gap-1.5">
        {STEPS.map((s, i) => (
          <span key={s} className={cx('h-1.5 rounded-full transition-all duration-500', i === index ? 'w-8 bg-blue-600' : i < index ? 'w-4 bg-blue-300 dark:bg-blue-800' : 'w-4 bg-zinc-200 dark:bg-zinc-700')} />
        ))}
        <span className="ml-2 text-xs text-zinc-400">{t.setup.step(index + 1, STEPS.length)}</span>
      </div>
      {index < STEPS.length - 1 && (
        <button onClick={onSkip} className="text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
          {t.setup.skip}
        </button>
      )}
    </div>
  );
}

function Header({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="mb-6 grid gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{text}</p>
    </div>
  );
}

function Footer({ onBack, children }: { onBack?: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="mt-8 flex items-center justify-between gap-2 border-t border-zinc-100 pt-5 dark:border-zinc-800">
      {onBack ? (
        <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
          {t.common.back}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const t = useT();
  const lang = useOffice((s) => s.lang);
  const icons: IconName[] = ['building', 'intern', 'lock'];
  return (
    <>
      <Header icon="sparkles" title={t.setup.welcomeTitle} text={t.setup.welcomeText} />
      <ul className="mb-6 grid gap-2">
        {t.setup.points.map((p, i) => (
          <li key={p} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm dark:bg-zinc-800/50">
            <Icon name={icons[i]} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            {p}
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon name="languages" className="h-4 w-4 text-zinc-400" /> {t.settings.language}
        </span>
        <div className="grid grid-cols-3 gap-2">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              aria-pressed={lang === l}
              className={cx(
                'rounded-xl border px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]',
                lang === l ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/15 dark:bg-blue-950/40 dark:text-blue-200' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700',
              )}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
      <Footer>
        <Button variant="primary" icon="arrowRight" onClick={onNext}>
          {t.setup.start}
        </Button>
      </Footer>
    </>
  );
}

// Quem faz o trabalho: a assinatura do Claude (Claude Code com login) ou um provedor. Vira o padrão das contratações,
// então o onboarding de quem for contratado no passo seguinte já roda nele.
function ProviderStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useT();
  const providers = useOffice((s) => s.state.providers);
  const current = useOffice((s) => s.state.settings.defaultProviderId);
  const models = useOffice((s) => s.models);
  const [form, setForm] = useState<'ollama' | 'custom' | null>(null);
  const selected = providers.some((p) => p.id === current) ? current : 0;
  const choose = (id: number) => {
    setForm(null);
    if (id !== current) void act(() => api('PATCH', '/api/settings', { defaultProviderId: id }));
  };
  const ready = models?.models.some((m) => m.status === 'ok');
  const claude = !models?.probedAt ? t.setup.claudeChecking : !models.cli ? t.setup.claudeMissing : ready ? t.setup.claudeReady(models.cli) : t.setup.claudeLogin(models.cli);

  return (
    <>
      <Header icon="server" title={t.setup.providerTitle} text={t.setup.providerText} />
      <div className="grid gap-2">
        <KindCard on={!form && selected === 0} icon="sparkles" title={t.setup.claudeTitle} text={claude} onClick={() => choose(0)} />
        {providers.map((p) => (
          <KindCard key={p.id} on={!form && selected === p.id} icon="server" title={p.name} text={`${p.base_url} · ${p.model}`} onClick={() => choose(p.id)} />
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          <KindCard on={form === 'ollama'} icon="server" title={t.providers.ollama} text={t.setup.ollamaText} onClick={() => setForm('ollama')} />
          <KindCard on={form === 'custom'} icon="globe" title={t.setup.customTitle} text={t.setup.customText} onClick={() => setForm('custom')} />
        </div>
      </div>
      {form && (
        <div className="mt-4 animate-rise rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <ProviderForm key={form} initial={form === 'ollama' ? OLLAMA : BLANK} onSaved={(p) => choose(p.id)} onCancel={() => setForm(null)} />
        </div>
      )}
      <p className="mt-4 text-xs text-zinc-500">{t.setup.providerLater}</p>
      <Footer onBack={onBack}>
        {form && <span className="text-xs text-zinc-400">{t.setup.saveFirst}</span>}
        <Button variant="primary" icon="arrowRight" disabled={!!form} onClick={onNext}>
          {t.common.next}
        </Button>
      </Footer>
    </>
  );
}

function Departments({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useT();
  const departments = useOffice((s) => s.state.departments);
  const employees = useOffice((s) => s.state.employees);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[departments.length % PALETTE.length]);
  const add = async (n = name) => {
    if (!n.trim()) return;
    if (await act(() => api('POST', '/api/departments', { name: n, color }))) {
      setName('');
      setColor(PALETTE[(departments.length + 1) % PALETTE.length]);
    }
  };
  const unused = t.setup.suggestions.filter((s) => !departments.some((d) => d.name.toLowerCase() === s.toLowerCase()));

  return (
    <>
      <Header icon="folderPlus" title={t.setup.deptsTitle} text={t.setup.deptsText} />
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex gap-2">
          <Input autoFocus placeholder={t.dept.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" icon="plus" disabled={!name.trim()}>
            {t.setup.add}
          </Button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        {unused.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unused.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                <Icon name="plus" className="h-3 w-3" /> {s}
              </button>
            ))}
          </div>
        )}
      </form>
      {departments.length > 0 && (
        <ul className="mt-5 grid gap-1.5">
          {departments.map((d) => {
            const n = employees.filter((e) => e.department_id === d.id).length;
            return (
              <li key={d.id} className="flex animate-rise items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <Dot color={d.color} />
                <span className="flex-1 font-medium">{d.name}</span>
                {n > 0 && <span className="text-xs text-zinc-400">{t.config.employees(n)}</span>}
                <button onClick={() => act(() => api('DELETE', `/api/departments/${d.id}`))} aria-label={t.common.remove} className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50">
                  <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Footer onBack={onBack}>
        {!departments.length && <span className="text-xs text-zinc-400">{t.setup.needDept}</span>}
        <Button variant="primary" icon="arrowRight" disabled={!departments.length} onClick={onNext}>
          {t.common.next}
        </Button>
      </Footer>
    </>
  );
}

function Team({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useT();
  const departments = useOffice((s) => s.state.departments);
  const employees = useOffice((s) => s.state.employees);
  const [intern, setIntern] = useState(false);

  return (
    <>
      <Header icon="userPlus" title={t.setup.teamTitle} text={t.setup.teamText} />
      <RepoImporter preferExisting />
      <div className="mt-5">
        {intern ? (
          <InternForm onDone={() => setIntern(false)} />
        ) : (
          <Button variant="secondary" icon="intern" onClick={() => setIntern(true)}>
            {t.setup.addIntern}
          </Button>
        )}
      </div>
      {employees.length > 0 && (
        <div className="mt-5 grid gap-2">
          <span className="text-xs font-medium text-zinc-500">{t.setup.hiredSoFar(employees.length)}</span>
          <div className="flex flex-wrap gap-1.5">
            {employees.map((e) => (
              <span key={e.id} className="inline-flex animate-pop items-center gap-1.5 rounded-full border border-zinc-200 py-1 pr-3 pl-1 text-xs font-medium dark:border-zinc-700">
                <Avatar name={e.name} color={departments.find((d) => d.id === e.department_id)?.color ?? '#999'} size="xs" />
                {e.name}
                {e.kind === 'intern' && <Icon name="intern" className="h-3 w-3 text-violet-500" />}
              </span>
            ))}
          </div>
        </div>
      )}
      <Footer onBack={onBack}>
        <Button variant={employees.length ? 'primary' : 'secondary'} icon="arrowRight" onClick={onNext}>
          {employees.length ? t.common.next : t.setup.hireLater}
        </Button>
      </Footer>
    </>
  );
}

function InternForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const departments = useOffice((s) => s.state.departments);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState(departments[0]?.id ?? 0);
  return (
    <form
      className="grid animate-rise gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20"
      onSubmit={async (e) => {
        e.preventDefault();
        const hired = await act(() => api<Employee>('POST', '/api/employees', { kind: 'intern', name, profile: role, departmentId: dept }));
        if (!hired) return;
        toast(t.hire.hiredIntern(hired.name), 'success');
        onDone();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.hire.name}>
          <Input autoFocus required placeholder={t.hire.internName} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.hire.department}>
          <Select value={dept} onChange={(e) => setDept(Number(e.target.value))}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t.hire.role}>
        <Textarea rows={2} placeholder={t.hire.rolePlaceholder} value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" icon="userPlus" disabled={!name.trim()}>
          {t.hire.hireBtn}
        </Button>
      </div>
    </form>
  );
}

// Onboarding de cada contratado, ao vivo: fazendo, pronto ou pendente (tenta de novo ao concluir).
function Done({ onFinish }: { onFinish: () => void }) {
  const t = useT();
  const departments = useOffice((s) => s.state.departments);
  const hires = useOffice((s) => s.state.employees).filter((e) => e.kind === 'repo');
  return (
    <>
      <Header icon="circleCheck" title={t.setup.doneTitle} text={t.setup.doneText} />
      {hires.length > 0 && (
        <ul className="grid max-h-64 gap-1.5 overflow-y-auto">
          {hires.map((e) => (
            <li key={e.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <Avatar name={e.name} color={departments.find((d) => d.id === e.department_id)?.color ?? '#999'} size="xs" />
              <span className="flex-1 truncate font-medium">{e.name}</span>
              {e.activity === 'onboarding' ? (
                <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                  <Spinner className="h-3 w-3" /> {t.setup.onboarding}
                </span>
              ) : e.profile ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Icon name="check" className="h-3.5 w-3.5" /> {t.setup.onboarded}
                </span>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400">{t.setup.onboardPending}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Footer>
        <Button variant="primary" icon="building" onClick={onFinish}>
          {t.setup.go}
        </Button>
      </Footer>
    </>
  );
}
