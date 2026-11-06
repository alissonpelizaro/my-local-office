import { useState } from 'react';
import { act, api, loadModels, useOffice, useT } from '../store';
import type { Employee } from '../types';
import { Icon } from './icons';
import { Button, Chip, ConfirmButton, Field, Input, Saved, Segmented, Select, SettingRow, Stepper, Switch, Textarea } from './ui';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// claude-opus-5-5 → Opus 5.5; claude-haiku-4-5-20251001 → Haiku 4.5
export function modelName(id: string) {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-\d{8})?$/);
  return m ? `${cap(m[1])} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id;
}

// Aliases acompanham a versão mais nova que o seu Claude Code conhece; a versão fixa não muda sozinha.
export function ModelSelect({ value, onChange, allowDefault = true, emptyLabel }: { value: string; onChange: (v: string) => void; allowDefault?: boolean; emptyLabel?: string }) {
  const t = useT();
  const models = useOffice((s) => s.models);
  const fallback = useOffice((s) => s.state.settings.defaultModel);
  const aliases = models?.aliases ?? ['opus', 'sonnet', 'haiku'].map((alias) => ({ alias, model: null }));
  const fixed = [...(models?.models ?? [])].sort((a, b) => modelName(b.id).localeCompare(modelName(a.id), undefined, { numeric: true }));
  const known = new Set(['', ...aliases.map((a) => a.alias), ...fixed.map((m) => m.id)]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {(allowDefault || emptyLabel) && <option value="">{emptyLabel ?? t.employee.officeDefault(fallback)}</option>}
      <optgroup label={t.employee.latest}>
        {aliases.map((a) => (
          <option key={a.alias} value={a.alias}>
            {cap(a.alias)}
            {a.model ? ` ${t.employee.todayModel(modelName(a.model))}` : ''}
          </option>
        ))}
      </optgroup>
      {fixed.length > 0 && (
        <optgroup label={t.employee.fixed}>
          {fixed.map((m) => (
            <option key={m.id} value={m.id} disabled={m.status !== 'ok'} title={m.note}>
              {modelName(m.id)}
              {m.status === 'update' ? ` · ${t.employee.updateCli(m.requires ?? '')}` : m.status === 'unavailable' ? ` · ${t.employee.unavailable}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {!known.has(value) && (
        <option value={value}>
          {value} · {t.employee.custom}
        </option>
      )}
    </Select>
  );
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Esforço de raciocínio (--effort). Vazio herda o padrão do escritório ou, no próprio escritório, o do Claude Code.
export function EffortSelect({ value, onChange, allowDefault = true }: { value: string; onChange: (v: string) => void; allowDefault?: boolean }) {
  const t = useT();
  const fallback = useOffice((s) => s.state.settings.defaultEffort);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allowDefault ? t.employee.officeDefault(t.employee.efforts[fallback] ?? 'Claude Code') : t.employee.claudeDefault}</option>
      {EFFORTS.map((v) => (
        <option key={v} value={v}>
          {t.employee.efforts[v]}
        </option>
      ))}
    </Select>
  );
}

// Provedor (nativo ou remoto) — o mesmo seletor no funcionário e no departamento.
export function ProviderSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const t = useT();
  const providers = useOffice((s) => s.state.providers);
  return (
    <Select value={value ?? ''} onChange={(ev) => onChange(ev.target.value ? Number(ev.target.value) : null)}>
      <option value="">{t.employee.nativeProvider}</option>
      {providers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {p.model}
        </option>
      ))}
    </Select>
  );
}

// Versão do CLI e modelos que pedem atualização; botão para testar de novo depois de atualizar.
export function ModelsStatus() {
  const t = useT();
  const models = useOffice((s) => s.models);
  const [busy, setBusy] = useState(false);
  const blocked = models?.models?.filter((m) => m.status === 'update') ?? [];
  return (
    <div className="grid gap-1 text-xs text-zinc-500">
      <div className="flex items-center gap-2">
        <span>
          Claude Code {models?.cli ?? '…'}
          {!models?.probedAt && ` · ${t.employee.testing}`}
        </span>
        <button
          className="text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await loadModels(true);
            setBusy(false);
          }}
        >
          {busy ? t.employee.testingBtn : t.employee.refreshList}
        </button>
      </div>
      {blocked.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t.employee.requires(
            blocked.map((m) => modelName(m.id)).join(', '),
            blocked.length > 1,
            blocked
              .map((m) => m.requires)
              .sort()
              .at(-1) ?? '',
          )}
        </p>
      )}
    </div>
  );
}

const Section = ({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) => (
  <section className="grid gap-3">
    <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
      {title}
      {aside}
    </h4>
    {children}
  </section>
);

export function EmployeeSettings({ e }: { e: Employee }) {
  const t = useT();
  const departments = useOffice((s) => s.state.departments);
  const [savedAt, setSavedAt] = useState(0);
  const intern = e.kind === 'intern';
  const patch = async (body: object) => {
    if ((await act(() => api('PATCH', `/api/employees/${e.id}`, body))) !== undefined) setSavedAt(Date.now());
  };
  return (
    <div className="grid gap-6">
      <Section title={t.employee.identity} aside={<Saved at={savedAt} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.employee.name} hint={t.employee.nameHint}>
            <Input defaultValue={e.name} key={e.name} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.name && patch({ name: ev.target.value })} />
          </Field>
          <Field label={t.employee.department}>
            <Select value={e.department_id} onChange={(ev) => patch({ departmentId: Number(ev.target.value) })}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title={t.employee.model}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.employee.provider}>
            <ProviderSelect value={e.provider_id} onChange={(providerId) => patch({ providerId })} />
          </Field>
          <Field label={t.employee.model} hint={e.provider_id ? t.employee.modelHint : undefined}>
            <ModelSelect value={e.model ?? ''} onChange={(model) => patch({ model })} />
          </Field>
          <Field label={t.employee.effort} hint={t.employee.effortHint}>
            <EffortSelect value={e.effort ?? ''} onChange={(effort) => patch({ effort })} />
          </Field>
        </div>
        <SettingRow title={t.employee.connectors} description={t.employee.connectorsHint}>
          <Switch label={t.employee.connectors} checked={!!e.connectors} onChange={(connectors) => patch({ connectors })} />
        </SettingRow>
      </Section>

      <Section title={t.employee.workspace}>
        {intern ? (
          <p className="text-xs text-zinc-500">
            {t.employee.internFolder} <code className="break-all">{e.repo_path}</code>
          </p>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Segmented
                value={e.isolation}
                onChange={(isolation) => patch({ isolation })}
                className="w-full [&>button]:flex-1"
                size="sm"
                options={[
                  { value: 'repo', label: t.employee.mainCopy },
                  { value: 'worktree', label: t.employee.worktree },
                ]}
              />
              <p className="text-xs text-zinc-500">{e.isolation === 'worktree' ? t.employee.worktreeOn : t.employee.worktreeOff}</p>
            </div>
            <SettingRow title={t.employee.parallel} description={t.employee.parallelHint}>
              <Stepper value={e.max_parallel} min={1} max={5} onChange={(maxParallel) => patch({ maxParallel })} />
            </SettingRow>
          </>
        )}
      </Section>

      <Section title={t.employee.permissions}>
        <SettingRow title={t.employee.autoEdit} description={t.employee.autoEditHint}>
          <Switch label={t.employee.autoEdit} checked={!!e.auto_edit} onChange={(autoEdit) => patch({ autoEdit })} />
        </SettingRow>
        {e.allow_rules.length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-xs text-zinc-500">{t.employee.alwaysAllowed}</span>
            <div className="flex flex-wrap gap-1.5">
              {e.allow_rules.map((r) => (
                <button
                  key={r}
                  title={t.employee.removeRule}
                  onClick={() => patch({ allowRules: e.allow_rules.filter((x) => x !== r) })}
                  className="group inline-flex animate-pop items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 transition hover:bg-red-100 hover:text-red-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-red-950 dark:hover:text-red-300"
                >
                  {r}
                  <Icon name="x" className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section
        title={intern ? t.employee.role : t.employee.profile}
        aside={!intern && <Chip tone={e.profile_source === 'manual' ? 'amber' : 'default'}>{e.profile_source === 'manual' ? t.employee.manual : t.employee.auto}</Chip>}
      >
        <Field
          label={intern ? t.employee.roleLabel : t.employee.profileLabel}
          hint={intern ? t.employee.roleHint : e.profile_source === 'manual' ? t.employee.profileManualHint : t.employee.profileAutoHint}
        >
          <Textarea rows={6} defaultValue={e.profile} key={e.profile} onBlur={(ev) => ev.target.value !== e.profile && patch({ profile: ev.target.value })} />
        </Field>
        {!intern && (
          <div>
            <Button size="sm" icon="refresh" onClick={() => act(() => api('POST', `/api/employees/${e.id}/onboard`))}>
              {t.employee.redoProfile}
            </Button>
          </div>
        )}
      </Section>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 p-3 dark:border-red-900/50">
        <div>
          <div className="text-sm font-medium">{t.employee.fire(e.name)}</div>
          <p className="text-xs text-zinc-500">{intern ? t.employee.fireTextIntern : t.employee.fireText}</p>
        </div>
        <ConfirmButton
          icon="trash"
          size="sm"
          confirm={t.employee.fireConfirm}
          onConfirm={async () => {
            // Fecha o painel dele sem trocar de aba (demitir pela Configuração continua na Configuração).
            if ((await act(() => api('DELETE', `/api/employees/${e.id}`))) !== undefined) useOffice.setState((s) => (s.selectedEmployeeId === e.id ? { selectedEmployeeId: null } : {}));
          }}
        >
          {t.employee.fireBtn}
        </ConfirmButton>
      </div>
    </div>
  );
}
