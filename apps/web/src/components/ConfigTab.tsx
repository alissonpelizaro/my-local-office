import { useEffect, useState } from 'react';
import { act, api, type ConfigSection, setTheme, toast, useOffice } from '../store';
import type { DiscoveredRepo, Employee, Provider, Settings } from '../types';
import { EffortSelect, EmployeeSettings, ModelSelect, ModelsStatus } from './EmployeeSettings';
import { Icon } from './icons';
import { Avatar, Button, Card, Chip, ConfirmButton, cx, Empty, Field, Input, Saved, Segmented, Select, SettingRow, Stepper, Switch } from './ui';

const SECTIONS: { value: ConfigSection; label: string }[] = [
  { value: 'team', label: 'Equipe' },
  { value: 'import', label: 'Importar' },
  { value: 'providers', label: 'Provedores' },
  { value: 'office', label: 'Escritório' },
];

export function ConfigTab() {
  const pref = useOffice((s) => s.configSection);
  const empty = useOffice((s) => s.state.employees.length === 0);
  // Escritório vazio abre direto na importação.
  const [section, setSection] = useState<ConfigSection>(() => pref ?? (empty ? 'import' : 'team'));
  useEffect(() => {
    if (!pref) return;
    setSection(pref);
    useOffice.setState({ configSection: null });
  }, [pref]);

  return (
    <div className="mx-auto grid max-w-4xl gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Configuração</h1>
        <Segmented value={section} onChange={setSection} options={SECTIONS} />
      </div>
      <div key={section} className="grid animate-rise gap-5">
        {section === 'team' && <TeamSection onImport={() => setSection('import')} />}
        {section === 'import' && <ImportSection onDone={() => setSection('team')} />}
        {section === 'providers' && <ProvidersSection />}
        {section === 'office' && <SettingsSection />}
      </div>
    </div>
  );
}

// ---------- equipe: departamentos com seus funcionários ----------

function TeamSection({ onImport }: { onImport: () => void }) {
  const { departments, employees } = useOffice((s) => s.state);
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [dept, setDept] = useState<number | ''>('');

  return (
    <>
      {departments.length === 0 && (
        <Empty icon="🏢" title="Nenhum departamento" action={<Button variant="primary" icon="download" onClick={onImport}>Importar repositórios</Button>}>
          Importe seus repositórios para montar a equipe, ou crie um departamento abaixo.
        </Empty>
      )}

      {departments.map((d) => {
        const team = employees.filter((e) => e.department_id === d.id);
        return (
          <section key={d.id} className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex items-center gap-3 px-4 py-3">
              <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full shadow-sm ring-2 ring-white transition hover:scale-110 dark:ring-zinc-900" style={{ background: d.color }} title="Mudar cor">
                <input type="color" value={d.color} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => act(() => api('PATCH', `/api/departments/${d.id}`, { color: e.target.value }))} />
              </label>
              <input
                defaultValue={d.name}
                key={d.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && act(() => api('PATCH', `/api/departments/${d.id}`, { name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
              />
              <span className="text-xs text-zinc-500">{team.length} funcionário(s)</span>
              <ConfirmButton size="sm" icon="trash" confirm={team.length ? `Remover com ${team.length}?` : 'Remover?'} onConfirm={() => act(() => api('DELETE', `/api/departments/${d.id}`))}>
                <span className="sr-only">Remover</span>
              </ConfirmButton>
            </div>
            {team.length > 0 && (
              <div className="border-t border-zinc-100 dark:border-zinc-800">
                {team.map((e) => (
                  <EmployeeRow key={e.id} e={e} color={d.color} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Novo departamento" description="Projeto (LYNN, Monnif) ou função.">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act(() => api('POST', '/api/departments', { name }))) setName('');
            }}
          >
            <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
            <Button type="submit" icon="plus" disabled={!name.trim()}>
              Criar
            </Button>
          </form>
        </Card>
        <Card title="Contratar um repositório" description="Para vários de uma vez, use Importar.">
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act(() => api('POST', '/api/employees', { repoPath, departmentId: dept }))) {
                setRepoPath('');
                toast('Contratado. O onboarding escreve a ficha em seguida.', 'success');
              }
            }}
          >
            <Input placeholder="~/webprojects/dta-base" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} required />
            <div className="flex gap-2">
              <Select value={dept} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : '')} required>
                <option value="">Departamento…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary" disabled={!repoPath.trim() || !dept}>
                Contratar
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

function EmployeeRow({ e, color }: { e: Employee; color: string }) {
  const { providers, settings } = useOffice((s) => s.state);
  const [open, setOpen] = useState(false);
  const provider = providers.find((p) => p.id === e.provider_id);
  return (
    <div className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
        <Avatar name={e.name} color={color} size="sm" activity={e.activity} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{e.name}</div>
          <div className="truncate text-xs text-zinc-500">{e.git_remote ?? e.repo_path}</div>
        </div>
        <div className="hidden flex-wrap justify-end gap-1 sm:flex">
          <Chip>{provider ? provider.name : (e.model ?? settings.defaultModel)}</Chip>
          {e.effort && <Chip>esforço {e.effort}</Chip>}
          {!!e.auto_edit && <Chip tone="blue">auto-edit</Chip>}
          {e.isolation === 'worktree' && <Chip tone="green" icon="branch">worktree</Chip>}
          {e.max_parallel > 1 && <Chip>{e.max_parallel}× paralelo</Chip>}
        </div>
        <Icon name="chevronDown" className={cx('h-4 w-4 text-zinc-400 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-rise border-t border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
          <EmployeeSettings e={e} />
        </div>
      )}
    </div>
  );
}

// ---------- importação em lote ----------

function ImportSection({ onDone }: { onDone: () => void }) {
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
    toast(
      `${results.length - failed.length} contratado(s).${failed.length ? ` Falhas: ${failed.map((f) => `${f.repoPath.split('/').pop()} (${f.error})`).join('; ')}` : ''}`,
      failed.length ? 'error' : 'success',
      failed.length ? undefined : { label: 'Ver equipe', run: onDone },
    );
    setPicked({});
    scan();
  };

  const available = repos?.filter((r) => !r.employedAs && !r.duplicateOf) ?? [];
  const count = Object.keys(picked).length;

  return (
    <Card title="Importar repositórios" description="Procura repositórios git numa pasta, sugere o departamento pela organização do remote e junta clones do mesmo remote.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          scan();
        }}
      >
        <div className="relative flex-1">
          <Icon name="folder" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder={settings.importRoot} value={root} onChange={(e) => setRoot(e.target.value)} className="pl-9" />
        </div>
        <Button type="submit" icon="search" busy={busy && !repos}>
          Procurar
        </Button>
      </form>
      <datalist id="dept-names">
        {departments.map((d) => (
          <option key={d.id} value={d.name} />
        ))}
      </datalist>

      {repos && repos.length === 0 && <Empty>Nenhum repositório git encontrado nessa pasta.</Empty>}
      {repos && repos.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>
              {repos.length} encontrado(s) · {available.length} disponível(is)
            </span>
            {available.length > 0 && (
              <button
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                onClick={() => setPicked(count === available.length ? {} : Object.fromEntries(available.map((r) => [r.repoPath, picked[r.repoPath] ?? r.suggestedDepartment])))}
              >
                {count === available.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            {repos.map((r) => {
              const blocked = r.employedAs ? `já é ${r.employedAs}` : r.duplicateOf ? `mesmo remote de ${r.duplicateOf}` : null;
              const on = r.repoPath in picked;
              return (
                <label
                  key={r.repoPath}
                  className={cx(
                    'flex items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm transition-colors last:border-0 dark:border-zinc-800',
                    blocked ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40',
                    on && 'bg-blue-50/60 dark:bg-blue-950/20',
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    disabled={!!blocked}
                    checked={on}
                    onChange={(e) => setPicked(({ [r.repoPath]: _, ...rest }) => (e.target.checked ? { ...rest, [r.repoPath]: r.suggestedDepartment } : rest))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-zinc-500">{r.remote ?? 'sem remote'}</div>
                  </div>
                  <div className="w-48 shrink-0">
                    {blocked ? (
                      <Chip>{blocked}</Chip>
                    ) : (
                      <Input
                        list="dept-names"
                        value={picked[r.repoPath] ?? r.suggestedDepartment}
                        disabled={!on}
                        onChange={(e) => setPicked((p) => ({ ...p, [r.repoPath]: e.target.value }))}
                        className="h-8 py-1"
                      />
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Cada contratado faz um onboarding rápido (um por vez) para escrever a própria ficha.</span>
            <Button variant="primary" icon="users" busy={busy} disabled={!count} onClick={hire}>
              Contratar {count || ''}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- provedores ----------

const BLANK = { name: '', format: 'openai' as Provider['format'], baseUrl: '', apiKey: '', model: '', smallModel: '', contextWindow: '' };
// O Ollama fala a API da Anthropic direto. A janela precisa bater com o contexto carregado nele (OLLAMA_CONTEXT_LENGTH).
const OLLAMA: typeof BLANK = { ...BLANK, name: 'Ollama', format: 'anthropic', baseUrl: 'http://127.0.0.1:11434', contextWindow: '65536' };
const isLocal = (url: string) => /\/\/(127\.0\.0\.1|localhost)\b/.test(url);

function ProvidersSection() {
  const providers = useOffice((s) => s.state.providers);
  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [found, setFound] = useState<string[]>([]); // modelos que o provedor anuncia, só como sugestão
  const bind = (k: keyof typeof BLANK) => ({ value: form?.[k] ?? '', onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...(f ?? BLANK), [k]: e.target.value })) });
  const loadModels = (f: typeof BLANK, id = editing) =>
    f.baseUrl.trim() && api<string[]>('POST', '/api/providers/models', { ...f, id }).then(setFound, () => setFound([]));
  const open = (f: typeof BLANK, id: number | null = null) => {
    setForm(f);
    setEditing(id);
    setFound([]);
    loadModels(f, id);
  };
  const close = () => {
    setForm(null);
    setEditing(null);
  };

  return (
    <>
      <Card
        title="Provedores remotos"
        description="Sem provedor, todos usam a assinatura Claude (nativo). Cadastre um para alternar por funcionário."
        actions={
          !form && (
            <div className="flex gap-2">
              <Button size="sm" icon="server" onClick={() => open(OLLAMA)}>
                Ollama local
              </Button>
              <Button size="sm" icon="plus" onClick={() => open(BLANK)}>
                Novo provedor
              </Button>
            </div>
          )
        }
      >
        <div className="grid gap-2">
          {providers.map((p) => (
            <div key={p.id} className={cx('flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm', editing === p.id ? 'border-blue-500' : 'border-zinc-200 dark:border-zinc-800')}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                <Icon name="server" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <b>{p.name}</b>
                  <Chip>{p.format === 'openai' ? 'OpenAI' : 'Anthropic'}</Chip>
                  {!p.has_key && !isLocal(p.base_url) && <Chip tone="amber">sem chave</Chip>}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {p.base_url} · {p.model}
                  {p.small_model ? ` / ${p.small_model}` : ''}
                  {p.context_window ? ` · ${Math.round(p.context_window / 1000)}K` : ''}
                </div>
              </div>
              <Button
                size="sm"
                icon="pencil"
                onClick={() =>
                  open(
                    { name: p.name, format: p.format, baseUrl: p.base_url, apiKey: '', model: p.model, smallModel: p.small_model ?? '', contextWindow: p.context_window ? String(p.context_window) : '' },
                    p.id,
                  )
                }
              >
                Editar
              </Button>
              <ConfirmButton size="sm" icon="trash" confirm="Remover?" onConfirm={() => act(() => api('DELETE', `/api/providers/${p.id}`))}>
                <span className="sr-only">Remover</span>
              </ConfirmButton>
            </div>
          ))}
          {providers.length === 0 && !form && <Empty icon="☁️" title="Nenhum provedor">Funcionários usam a assinatura Claude.</Empty>}
        </div>
      </Card>

      {form && (
        <Card title={editing ? 'Editar provedor' : 'Novo provedor'} className="animate-rise">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await act(() => (editing ? api('PATCH', `/api/providers/${editing}`, form) : api('POST', '/api/providers', form)));
              if (ok) {
                toast(editing ? 'Provedor atualizado.' : 'Provedor cadastrado.', 'success');
                close();
              }
            }}
          >
            <Field label="Nome">
              <Input placeholder="dta-proxy" required autoFocus {...bind('name')} />
            </Field>
            <Field group label="Formato">
              <Segmented
                value={form.format}
                onChange={(format) => setForm({ ...form, format })}
                className="w-full [&>button]:flex-1"
                size="sm"
                options={[
                  { value: 'openai', label: 'OpenAI (ponte)' },
                  { value: 'anthropic', label: 'Anthropic (direto)' },
                ]}
              />
            </Field>
            <Field label="Base URL" hint={form.format === 'openai' ? 'Com /v1 — ex. https://proxy.lynn.totvs.ai/v1' : 'Sem /v1 — ex. https://proxy.lynn.totvs.ai'}>
              <Input required {...bind('baseUrl')} onBlur={() => loadModels(form)} />
            </Field>
            <Field label="API key" hint={editing ? 'Vazio mantém a chave salva.' : isLocal(form.baseUrl) ? 'Local não precisa.' : 'Fica em data/ e nunca volta para a UI.'}>
              <Input type="password" autoComplete="off" {...bind('apiKey')} onBlur={() => loadModels(form)} />
            </Field>
            <Field label="Modelo" hint={found.length ? `Precisa suportar tools. ${found.length} no provedor: escolha na lista.` : 'Precisa suportar tools.'}>
              <Input placeholder="gpt-4o" required list="provider-models" {...bind('model')} />
            </Field>
            <Field label="Modelo leve (opcional)" hint="Usado no lugar do haiku.">
              <Input placeholder="gpt-4o-mini" list="provider-models" {...bind('smallModel')} />
            </Field>
            <Field label="Janela de contexto (opcional)" hint="Tokens que o modelo aguenta; a conversa é compactada antes. No Ollama, o mesmo valor de OLLAMA_CONTEXT_LENGTH.">
              <Input inputMode="numeric" placeholder="65536" {...bind('contextWindow')} />
            </Field>
            <datalist id="provider-models">
              {found.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                {editing ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}

// ---------- preferências do escritório ----------

function SettingsSection() {
  const settings = useOffice((s) => s.state.settings);
  const theme = useOffice((s) => s.theme);
  const [importRoot, setImportRoot] = useState(settings.importRoot);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => setImportRoot(settings.importRoot), [settings.importRoot]);
  const save = async (patch: Partial<Settings>) => {
    if ((await act(() => api('PATCH', '/api/settings', patch))) !== undefined) setSavedAt(Date.now());
  };

  return (
    <>
      <Card title="Execução" actions={<Saved at={savedAt} />}>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title="Execuções simultâneas" description="Tarefas rodando ao mesmo tempo no escritório. Consultas e onboarding ficam à parte.">
            <Stepper value={settings.maxConcurrent} min={1} max={20} onChange={(maxConcurrent) => save({ maxConcurrent })} />
          </SettingRow>
          <SettingRow title="Delegação entre agentes pede aprovação" description="Quando um funcionário delega a outro, a tarefa espera o seu ok.">
            <Switch label="Delegação pede aprovação" checked={settings.delegationNeedsApproval} onChange={(delegationNeedsApproval) => save({ delegationNeedsApproval })} />
          </SettingRow>
          <SettingRow
            title="Liberar comandos só de leitura"
            description="ls, cat, grep, find, git log/diff/status… (inclusive encadeados) rodam sem pedir. Redirecionar para arquivo, subshell ou caminho fora do repo continua pedindo."
          >
            <Switch label="Liberar comandos só de leitura" checked={settings.autoAllowReadOnly} onChange={(autoAllowReadOnly) => save({ autoAllowReadOnly })} />
          </SettingRow>
          <SettingRow
            title="Só pedir permissão para ações externas"
            description="Agentes rodam qualquer comando local e editam no repo sem pedir. Continuam pedindo: git push, criar/mergear/revisar PR, publish, docker/kubectl/gcloud/terraform, gh api de escrita, MCP de envio e edição fora da pasta de trabalho. Atenção: rm, curl e afins locais passam."
          >
            <Switch label="Só pedir permissão para ações externas" checked={settings.onlyAskExternal} onChange={(onlyAskExternal) => save({ onlyAskExternal })} />
          </SettingRow>
        </div>
      </Card>

      <Card title="Modelos">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title="Modelo padrão" description="Usado por quem está no nativo sem modelo próprio.">
            <div className="w-56">
              <ModelSelect allowDefault={false} value={settings.defaultModel} onChange={(defaultModel) => save({ defaultModel })} />
            </div>
          </SettingRow>
          <SettingRow title="Modelo do onboarding" description="Escreve e atualiza as fichas. Um modelo leve basta.">
            <div className="w-56">
              <ModelSelect allowDefault={false} value={settings.onboardModel} onChange={(onboardModel) => save({ onboardModel })} />
            </div>
          </SettingRow>
          <SettingRow title="Modelo das consultas" description="Quando um colega pergunta algo a outro. Só leitura: não precisa do modelo mais caro.">
            <div className="w-56">
              <ModelSelect allowDefault={false} emptyLabel="Modelo do colega" value={settings.consultModel} onChange={(consultModel) => save({ consultModel })} />
            </div>
          </SettingRow>
          <SettingRow title="Esforço padrão" description="Quanto o modelo pensa antes de agir. Cada funcionário pode ter o seu.">
            <div className="w-56">
              <EffortSelect allowDefault={false} value={settings.defaultEffort} onChange={(defaultEffort) => save({ defaultEffort })} />
            </div>
          </SettingRow>
          <SettingRow
            title="Compactar conversa acima de (mil tokens)"
            description="Cada chamada relê a conversa inteira; passando disso o Claude Code resume o histórico. 0 deixa o Claude Code decidir (em modelos de 1M a conversa cresce muito)."
          >
            <Stepper value={settings.compactWindow / 1000} min={0} max={1000} step={25} onChange={(k) => save({ compactWindow: k * 1000 })} />
          </SettingRow>
          <SettingRow title="Atualizar fichas a cada N commits" description="Fichas automáticas são refeitas quando o repo anda isso. 0 desliga.">
            <Stepper value={settings.profileRefreshCommits} min={0} max={1000} step={10} onChange={(profileRefreshCommits) => save({ profileRefreshCommits })} />
          </SettingRow>
          <div className="pt-3">
            <ModelsStatus />
          </div>
        </div>
      </Card>

      <Card title="Notificações e aparência">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title="Quando alguém precisa de mim" description="Pedido de permissão, pergunta ou delegação vira notificação do macOS.">
            <Switch label="Notificar pedidos" checked={settings.notifyApprovals} onChange={(notifyApprovals) => save({ notifyApprovals })} />
          </SettingRow>
          <SettingRow title="Quando uma tarefa termina" description="Séries recorrentes só avisam quando uma execução falha.">
            <Switch label="Notificar fim de tarefa" checked={settings.notifyTaskFinished} onChange={(notifyTaskFinished) => save({ notifyTaskFinished })} />
          </SettingRow>
          <SettingRow title="Tema">
            <Segmented
              size="sm"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Claro', icon: 'sun' },
                { value: 'dark', label: 'Escuro', icon: 'moon' },
                { value: 'system', label: 'Sistema', icon: 'monitor' },
              ]}
            />
          </SettingRow>
          <SettingRow title="Pasta padrão de importação">
            <Input className="w-64" value={importRoot} onChange={(e) => setImportRoot(e.target.value)} onBlur={() => importRoot !== settings.importRoot && save({ importRoot })} />
          </SettingRow>
        </div>
      </Card>
    </>
  );
}
