import { useEffect, useState } from 'react';
import { act, api, toast, useOffice } from '../store';
import type { DiscoveredRepo, Employee, Provider, Settings } from '../types';
import { EmployeeSettings, ModelSelect, ModelsStatus } from './EmployeeSettings';
import { Button, Card, Chip, Dot, Empty, Field, Input, Select } from './ui';

export function ConfigTab() {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 overflow-y-auto p-4">
      <ImportSection />
      <DepartmentsSection />
      <EmployeesSection />
      <ProvidersSection />
      <SettingsSection />
    </div>
  );
}

function ImportSection() {
  const settings = useOffice((s) => s.state.settings);
  const departments = useOffice((s) => s.state.departments);
  const [root, setRoot] = useState('');
  const [repos, setRepos] = useState<DiscoveredRepo[] | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({}); // repoPath → departamento
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    const r = await act(() => api<{ repos: DiscoveredRepo[] }>('GET', `/api/discover?root=${encodeURIComponent(root || settings.importRoot)}`));
    setBusy(false);
    if (!r) return;
    // Pré-marca (e lista primeiro) o que cai num departamento que já existe.
    const known = new Set(departments.map((d) => d.name.toLowerCase()));
    const isKnown = (x: DiscoveredRepo) => known.has(x.suggestedDepartment.toLowerCase());
    setRepos(r.repos.toSorted((a, b) => Number(isKnown(b)) - Number(isKnown(a))));
    setPicked(Object.fromEntries(r.repos.filter((x) => !x.employedAs && !x.duplicateOf && isKnown(x)).map((x) => [x.repoPath, x.suggestedDepartment])));
  };

  const hire = async () => {
    const items = Object.entries(picked).map(([repoPath, department]) => ({ repoPath, department }));
    setBusy(true);
    const results = await act(() => api<{ repoPath: string; ok: boolean; error?: string }[]>('POST', '/api/import', { items }));
    setBusy(false);
    if (!results) return;
    const failed = results.filter((r) => !r.ok);
    toast(`${results.length - failed.length} contratado(s).${failed.length ? ` Falhas: ${failed.map((f) => `${f.repoPath.split('/').pop()} (${f.error})`).join('; ')}` : ''}`, failed.length ? 'error' : 'info');
    setPicked({});
    scan();
  };

  return (
    <Card title="Importar repositórios">
      <div className="flex gap-2">
        <Input placeholder={settings.importRoot} value={root} onChange={(e) => setRoot(e.target.value)} />
        <Button onClick={scan} disabled={busy}>
          Procurar
        </Button>
      </div>
      <datalist id="dept-names">
        {departments.map((d) => (
          <option key={d.id} value={d.name} />
        ))}
      </datalist>
      {repos && (
        <>
          <div className="mt-3 max-h-[420px] overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <tbody>
                {repos.map((r) => {
                  const blocked = r.employedAs ? `já é ${r.employedAs}` : r.duplicateOf ? `mesmo remote de ${r.duplicateOf}` : null;
                  const on = r.repoPath in picked;
                  return (
                    <tr key={r.repoPath} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      <td className="w-8 px-2">
                        <input
                          type="checkbox"
                          disabled={!!blocked}
                          checked={on}
                          onChange={(e) =>
                            setPicked(({ [r.repoPath]: _, ...rest }) => (e.target.checked ? { ...rest, [r.repoPath]: r.suggestedDepartment } : rest))
                          }
                        />
                      </td>
                      <td className="py-1.5">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-zinc-500">{r.remote ?? 'sem remote'}</div>
                      </td>
                      <td className="w-56 px-2">
                        {blocked ? (
                          <Chip>{blocked}</Chip>
                        ) : (
                          <Input
                            list="dept-names"
                            value={picked[r.repoPath] ?? r.suggestedDepartment}
                            disabled={!on}
                            onChange={(e) => setPicked((p) => ({ ...p, [r.repoPath]: e.target.value }))}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Cada contratado faz um onboarding rápido (um por vez) para escrever a própria ficha.</span>
            <Button variant="primary" disabled={busy || !Object.keys(picked).length} onClick={hire}>
              Contratar {Object.keys(picked).length || ''}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function DepartmentsSection() {
  const departments = useOffice((s) => s.state.departments);
  const employees = useOffice((s) => s.state.employees);
  const [name, setName] = useState('');
  return (
    <Card title="Departamentos">
      <div className="grid gap-2">
        {departments.map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <input
              type="color"
              value={d.color}
              className="h-8 w-10 cursor-pointer rounded border border-zinc-300 bg-transparent dark:border-zinc-700"
              onChange={(e) => act(() => api('PATCH', `/api/departments/${d.id}`, { color: e.target.value }))}
            />
            <Input defaultValue={d.name} onBlur={(e) => e.target.value !== d.name && act(() => api('PATCH', `/api/departments/${d.id}`, { name: e.target.value }))} />
            <span className="w-28 shrink-0 text-xs text-zinc-500">{employees.filter((e) => e.department_id === d.id).length} funcionário(s)</span>
            <Button
              variant="danger"
              onClick={() => confirm(`Remover ${d.name} e seus funcionários?`) && act(() => api('DELETE', `/api/departments/${d.id}`))}
            >
              Remover
            </Button>
          </div>
        ))}
        {departments.length === 0 && <Empty>Nenhum departamento. Importe repositórios acima ou crie um.</Empty>}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => api('POST', '/api/departments', { name }))) setName('');
        }}
      >
        <Input placeholder="Novo departamento" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button>Criar</Button>
      </form>
    </Card>
  );
}

function EmployeesSection() {
  const { departments, employees, providers } = useOffice((s) => s.state);
  const [repoPath, setRepoPath] = useState('');
  const [dept, setDept] = useState<number | ''>('');
  return (
    <Card title="Funcionários">
      <div className="grid gap-2">
        {employees.map((e) => (
          <EmployeeRow key={e.id} e={e} />
        ))}
        {employees.length === 0 && <Empty>Ninguém contratado ainda.</Empty>}
      </div>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_200px_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => api('POST', '/api/employees', { repoPath, departmentId: dept }))) setRepoPath('');
        }}
      >
        <Input placeholder="Pasta do repo (~/webprojects/dta-base)" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} required />
        <Select value={dept} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : '')} required>
          <option value="">Departamento</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Button variant="primary">Contratar</Button>
      </form>
      {providers.length === 0 && <p className="mt-2 text-xs text-zinc-500">Todos usam a assinatura nativa. Cadastre um provedor remoto abaixo para alternar por funcionário.</p>}
    </Card>
  );
}

function EmployeeRow({ e }: { e: Employee }) {
  const { departments, providers, settings } = useOffice((s) => s.state);
  const dept = departments.find((d) => d.id === e.department_id);
  return (
    <details className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <summary className="flex cursor-pointer items-center gap-2 text-sm">
        <Dot color={dept?.color ?? '#999'} />
        <b>{e.name}</b>
        <span className="text-xs text-zinc-500">
          {dept?.name} · {e.provider_id ? providers.find((p) => p.id === e.provider_id)?.name : `nativo · ${e.model ?? settings.defaultModel}`}
          {e.auto_edit ? ' · auto-edit' : ''}
          {e.isolation === 'worktree' ? ' · worktree' : ''}
          {e.max_parallel > 1 ? ` · ${e.max_parallel} em paralelo` : ''}
        </span>
      </summary>
      <div className="mt-3">
        <EmployeeSettings e={e} />
      </div>
    </details>
  );
}

const BLANK = { name: '', format: 'openai' as Provider['format'], baseUrl: '', apiKey: '', model: '', smallModel: '' };

function ProvidersSection() {
  const providers = useOffice((s) => s.state.providers);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState<number | null>(null);
  const bind = (k: keyof typeof BLANK) => ({ value: form[k], onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })) });

  return (
    <Card title="Provedores remotos">
      <div className="grid gap-2">
        {providers.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
            <b>{p.name}</b>
            <Chip>{p.format === 'openai' ? 'OpenAI' : 'Anthropic'}</Chip>
            <span className="text-xs text-zinc-500">
              {p.base_url} · {p.model}
              {p.small_model ? ` / ${p.small_model}` : ''} {p.has_key ? '· 🔑' : '· sem chave'}
            </span>
            <span className="ml-auto flex gap-2">
              <Button
                onClick={() => {
                  setEditing(p.id);
                  setForm({ name: p.name, format: p.format, baseUrl: p.base_url, apiKey: '', model: p.model, smallModel: p.small_model ?? '' });
                }}
              >
                Editar
              </Button>
              <Button variant="danger" onClick={() => confirm(`Remover ${p.name}?`) && act(() => api('DELETE', `/api/providers/${p.id}`))}>
                Remover
              </Button>
            </span>
          </div>
        ))}
        {providers.length === 0 && <Empty>Nenhum. Funcionários usam a assinatura Claude.</Empty>}
      </div>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(() => (editing ? api('PATCH', `/api/providers/${editing}`, form) : api('POST', '/api/providers', form)));
          if (ok) {
            setForm(BLANK);
            setEditing(null);
          }
        }}
      >
        <Field label="Nome">
          <Input placeholder="dta-proxy" required {...bind('name')} />
        </Field>
        <Field label="Formato">
          <Select {...bind('format')}>
            <option value="openai">OpenAI-compatível (ponte local)</option>
            <option value="anthropic">Anthropic-compatível (direto)</option>
          </Select>
        </Field>
        <Field label="Base URL" hint={form.format === 'openai' ? 'Com /v1 — ex. https://proxy.lynn.totvs.ai/v1' : 'Sem /v1 — ex. https://proxy.lynn.totvs.ai'}>
          <Input required {...bind('baseUrl')} />
        </Field>
        <Field label="API key" hint={editing ? 'Vazio mantém a chave salva.' : 'Fica em data/ e nunca volta para a UI.'}>
          <Input type="password" autoComplete="off" {...bind('apiKey')} />
        </Field>
        <Field label="Modelo" hint="Precisa suportar tools.">
          <Input placeholder="gpt-4o" required {...bind('model')} />
        </Field>
        <Field label="Modelo leve (opcional)" hint="Usado no lugar do haiku.">
          <Input placeholder="gpt-4o-mini" {...bind('smallModel')} />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button variant="primary">{editing ? 'Salvar alterações' : 'Cadastrar provedor'}</Button>
          {editing && (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(BLANK);
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function SettingsSection() {
  const settings = useOffice((s) => s.state.settings);
  const [form, setForm] = useState<Settings>(settings);
  useEffect(() => setForm(settings), [settings]);
  const save = (patch: Partial<Settings>) => act(() => api('PATCH', '/api/settings', patch));

  return (
    <Card title="Escritório">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Execuções simultâneas" hint="Tasks rodando ao mesmo tempo (consultas e onboarding à parte).">
          <Input
            type="number"
            min={1}
            max={20}
            value={form.maxConcurrent}
            onChange={(e) => setForm({ ...form, maxConcurrent: Number(e.target.value) })}
            onBlur={() => form.maxConcurrent !== settings.maxConcurrent && save({ maxConcurrent: form.maxConcurrent })}
          />
        </Field>
        <Field label="Delegação entre agentes">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.delegationNeedsApproval} onChange={(e) => save({ delegationNeedsApproval: e.target.checked })} /> Exigir minha aprovação
          </label>
        </Field>
        <Field label="Modelo padrão (nativo)">
          <ModelSelect allowDefault={false} value={form.defaultModel} onChange={(defaultModel) => save({ defaultModel })} />
        </Field>
        <Field label="Modelo do onboarding">
          <ModelSelect allowDefault={false} value={form.onboardModel} onChange={(onboardModel) => save({ onboardModel })} />
        </Field>
        <div className="sm:col-span-2">
          <ModelsStatus />
        </div>
        <Field label="Pasta padrão de importação">
          <Input value={form.importRoot} onChange={(e) => setForm({ ...form, importRoot: e.target.value })} onBlur={() => save({ importRoot: form.importRoot })} />
        </Field>
        <Field label="Notificações do macOS">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notifyApprovals} onChange={(e) => save({ notifyApprovals: e.target.checked })} /> Quando alguém precisa de mim
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notifyTaskFinished} onChange={(e) => save({ notifyTaskFinished: e.target.checked })} /> Quando uma task termina
          </label>
        </Field>
        <Field label="Comandos só de leitura" hint="ls, cat, grep, find, git log/diff/status… (inclusive encadeados) sem pedir permissão. Redirecionar para arquivo, subshell ou caminho fora do repo continua pedindo.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.autoAllowReadOnly} onChange={(e) => save({ autoAllowReadOnly: e.target.checked })} /> Liberar automaticamente
          </label>
        </Field>
        <Field label="Atualizar fichas a cada N commits" hint="Fichas automáticas são refeitas (haiku) quando o repo anda isso. 0 desliga.">
          <Input
            type="number"
            min={0}
            value={form.profileRefreshCommits}
            onChange={(e) => setForm({ ...form, profileRefreshCommits: Number(e.target.value) })}
            onBlur={() => form.profileRefreshCommits !== settings.profileRefreshCommits && save({ profileRefreshCommits: form.profileRefreshCommits })}
          />
        </Field>
      </div>
    </Card>
  );
}
