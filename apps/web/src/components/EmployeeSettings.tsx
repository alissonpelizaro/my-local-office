import { useState } from 'react';
import { act, api, loadModels, selectEmployee, useOffice } from '../store';
import type { Employee } from '../types';
import { Button, Chip, Field, Input, Select, Textarea } from './ui';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// claude-opus-5-5 → Opus 5.5; claude-haiku-4-5-20251001 → Haiku 4.5
export function modelName(id: string) {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-\d{8})?$/);
  return m ? `${cap(m[1])} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id;
}

// Aliases acompanham a versão mais nova que o seu Claude Code conhece; a versão fixa não muda sozinha.
export function ModelSelect({ value, onChange, allowDefault = true }: { value: string; onChange: (v: string) => void; allowDefault?: boolean }) {
  const models = useOffice((s) => s.models);
  const fallback = useOffice((s) => s.state.settings.defaultModel);
  const aliases = models?.aliases ?? ['opus', 'sonnet', 'haiku'].map((alias) => ({ alias, model: null }));
  const fixed = [...(models?.models ?? [])].sort((a, b) => modelName(b.id).localeCompare(modelName(a.id), undefined, { numeric: true }));
  const known = new Set(['', ...aliases.map((a) => a.alias), ...fixed.map((m) => m.id)]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowDefault && <option value="">Padrão do escritório ({fallback})</option>}
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

export function EmployeeSettings({ e }: { e: Employee }) {
  const { departments, providers } = useOffice((s) => s.state);
  const patch = (body: object) => act(() => api('PATCH', `/api/employees/${e.id}`, body));
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" hint="Usado pelos colegas para te consultar.">
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
        <Field
          label="Onde trabalha"
          hint={e.isolation === 'worktree' ? 'Cada task num git worktree próprio; sua cópia do repo fica intocada.' : 'Na sua cópia do repo; tasks extras em paralelo vão para worktrees.'}
        >
          <Select value={e.isolation} onChange={(ev) => patch({ isolation: ev.target.value })}>
            <option value="repo">Na cópia principal do repo</option>
            <option value="worktree">Sempre num worktree isolado</option>
          </Select>
        </Field>
        <Field label="Tasks em paralelo" hint="Acima de 1, as que não cabem na cópia principal vão para worktrees.">
          <Select value={e.max_parallel} onChange={(ev) => patch({ maxParallel: Number(ev.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!e.auto_edit} onChange={(ev) => patch({ autoEdit: ev.target.checked })} /> Editar arquivos na pasta de trabalho sem pedir
      </label>
      <Field
        label="Ficha"
        hint={
          e.profile_source === 'manual'
            ? 'Editada à mão: não é refeita automaticamente. "Refazer ficha" volta ao modo automático.'
            : 'Os colegas usam a ficha para saber o que perguntar. Refeita sozinha quando o repo anda muitos commits.'
        }
      >
        <Textarea rows={5} defaultValue={e.profile} key={e.profile} onBlur={(ev) => ev.target.value !== e.profile && patch({ profile: ev.target.value })} />
      </Field>
      {e.allow_rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Sempre permitido:</span>
          {e.allow_rules.map((r) => (
            <Chip key={r}>
              {r}
              <button title="Remover regra" onClick={() => patch({ allowRules: e.allow_rules.filter((x) => x !== r) })}>
                ✕
              </button>
            </Chip>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={() => act(() => api('POST', `/api/employees/${e.id}/onboard`))}>Refazer ficha</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Demitir ${e.name}?`)) return;
            if ((await act(() => api('DELETE', `/api/employees/${e.id}`))) !== undefined) selectEmployee(null);
          }}
        >
          Demitir
        </Button>
      </div>
    </div>
  );
}
