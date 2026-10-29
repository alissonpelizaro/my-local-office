import { useState } from 'react';
import { act, api, loadModels, selectEmployee, useOffice } from '../store';
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
  const models = useOffice((s) => s.models);
  const fallback = useOffice((s) => s.state.settings.defaultModel);
  const aliases = models?.aliases ?? ['opus', 'sonnet', 'haiku'].map((alias) => ({ alias, model: null }));
  const fixed = [...(models?.models ?? [])].sort((a, b) => modelName(b.id).localeCompare(modelName(a.id), undefined, { numeric: true }));
  const known = new Set(['', ...aliases.map((a) => a.alias), ...fixed.map((m) => m.id)]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {(allowDefault || emptyLabel) && <option value="">{emptyLabel ?? `Padrão do escritório (${fallback})`}</option>}
      <optgroup label="Sempre o mais recente">
        {aliases.map((a) => (
          <option key={a.alias} value={a.alias}>
            {cap(a.alias)}
            {a.model ? ` (hoje ${modelName(a.model)})` : ''}
          </option>
        ))}
      </optgroup>
      {fixed.length > 0 && (
        <optgroup label="Versão fixa">
          {fixed.map((m) => (
            <option key={m.id} value={m.id} disabled={m.status !== 'ok'} title={m.note}>
              {modelName(m.id)}
              {m.status === 'update' ? ` · atualize o Claude Code (≥ ${m.requires})` : m.status === 'unavailable' ? ' · indisponível' : ''}
            </option>
          ))}
        </optgroup>
      )}
      {!known.has(value) && <option value={value}>{value} · personalizado</option>}
    </Select>
  );
}

const EFFORTS: Record<string, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra alto', max: 'Máximo' };

// Esforço de raciocínio (--effort). Vazio herda o padrão do escritório ou, no próprio escritório, o do Claude Code.
export function EffortSelect({ value, onChange, allowDefault = true }: { value: string; onChange: (v: string) => void; allowDefault?: boolean }) {
  const fallback = useOffice((s) => s.state.settings.defaultEffort);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allowDefault ? `Padrão do escritório (${EFFORTS[fallback] ?? 'Claude Code'})` : 'Padrão do Claude Code'}</option>
      {Object.entries(EFFORTS).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </Select>
  );
}

// Versão do CLI e modelos que pedem atualização; botão para testar de novo depois de atualizar.
export function ModelsStatus() {
  const models = useOffice((s) => s.models);
  const [busy, setBusy] = useState(false);
  const blocked = models?.models?.filter((m) => m.status === 'update') ?? [];
  return (
    <div className="grid gap-1 text-xs text-zinc-500">
      <div className="flex items-center gap-2">
        <span>
          Claude Code {models?.cli ?? '…'}
          {!models?.probedAt && ' · testando modelos…'}
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
          {busy ? 'testando…' : 'Atualizar lista'}
        </button>
      </div>
      {blocked.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {blocked.map((m) => modelName(m.id)).join(', ')} {blocked.length > 1 ? 'exigem' : 'exige'} Claude Code ≥ {blocked.map((m) => m.requires).sort().at(-1)}. Rode{' '}
          <code>claude update</code> (ou <code>brew upgrade --cask claude-code</code>) e clique em “Atualizar lista”.
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
  const { departments, providers } = useOffice((s) => s.state);
  const [savedAt, setSavedAt] = useState(0);
  const patch = async (body: object) => {
    if ((await act(() => api('PATCH', `/api/employees/${e.id}`, body))) !== undefined) setSavedAt(Date.now());
  };
  return (
    <div className="grid gap-6">
      <Section title="Identidade" aside={<Saved at={savedAt} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" hint="Como os colegas te chamam.">
            <Input defaultValue={e.name} key={e.name} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.name && patch({ name: ev.target.value })} />
          </Field>
          <Field label="Departamento">
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

      <Section title="Modelo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provedor">
            <Select value={e.provider_id ?? ''} onChange={(ev) => patch({ providerId: ev.target.value ? Number(ev.target.value) : null })}>
              <option value="">Nativo (assinatura Claude)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.model}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Modelo" hint={e.provider_id ? 'Com provedor remoto vale o modelo do provedor.' : undefined}>
            <ModelSelect value={e.model ?? ''} onChange={(model) => patch({ model })} />
          </Field>
          <Field label="Esforço" hint="Mais esforço pensa mais e gasta mais tokens.">
            <EffortSelect value={e.effort ?? ''} onChange={(effort) => patch({ effort })} />
          </Field>
        </div>
      </Section>

      <Section title="Área de trabalho">
        <div className="grid gap-1.5">
          <Segmented
            value={e.isolation}
            onChange={(isolation) => patch({ isolation })}
            className="w-full [&>button]:flex-1"
            size="sm"
            options={[
              { value: 'repo', label: 'Cópia principal' },
              { value: 'worktree', label: 'Worktree isolado' },
            ]}
          />
          <p className="text-xs text-zinc-500">
            {e.isolation === 'worktree' ? 'Cada tarefa num git worktree próprio; sua cópia do repo fica intocada.' : 'Trabalha na sua cópia do repo; tarefas extras em paralelo vão para worktrees.'}
          </p>
        </div>
        <SettingRow title="Tarefas em paralelo" description="Acima de 1, as que não cabem na cópia principal vão para worktrees.">
          <Stepper value={e.max_parallel} min={1} max={5} onChange={(maxParallel) => patch({ maxParallel })} />
        </SettingRow>
      </Section>

      <Section title="Permissões">
        <SettingRow title="Editar sem pedir" description="Edit/Write dentro da pasta de trabalho não pedem permissão.">
          <Switch label="Editar sem pedir" checked={!!e.auto_edit} onChange={(autoEdit) => patch({ autoEdit })} />
        </SettingRow>
        {e.allow_rules.length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-xs text-zinc-500">Sempre permitido (clique para remover):</span>
            <div className="flex flex-wrap gap-1.5">
              {e.allow_rules.map((r) => (
                <button
                  key={r}
                  title="Remover regra"
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

      <Section title="Ficha" aside={<Chip tone={e.profile_source === 'manual' ? 'amber' : 'default'}>{e.profile_source === 'manual' ? 'editada à mão' : 'automática'}</Chip>}>
        <Field
          label="O que este funcionário sabe"
          hint={
            e.profile_source === 'manual'
              ? 'Editada à mão: não é refeita sozinha. "Refazer ficha" volta ao modo automático.'
              : 'Os colegas usam a ficha para saber o que perguntar. Refeita sozinha quando o repo anda muitos commits.'
          }
        >
          <Textarea rows={6} defaultValue={e.profile} key={e.profile} onBlur={(ev) => ev.target.value !== e.profile && patch({ profile: ev.target.value })} />
        </Field>
        <div>
          <Button size="sm" icon="refresh" onClick={() => act(() => api('POST', `/api/employees/${e.id}/onboard`))}>
            Refazer ficha
          </Button>
        </div>
      </Section>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 p-3 dark:border-red-900/50">
        <div>
          <div className="text-sm font-medium">Demitir {e.name}</div>
          <p className="text-xs text-zinc-500">Remove o funcionário e o histórico de tarefas dele. O repositório não é tocado.</p>
        </div>
        <ConfirmButton
          icon="trash"
          size="sm"
          confirm="Confirmar demissão"
          onConfirm={async () => {
            if ((await act(() => api('DELETE', `/api/employees/${e.id}`))) !== undefined) selectEmployee(null);
          }}
        >
          Demitir
        </ConfirmButton>
      </div>
    </div>
  );
}
