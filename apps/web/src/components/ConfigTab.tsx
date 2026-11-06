import { useEffect, useState } from 'react';
import { ago } from '../format';
import { LANG_LABEL, LANGS } from '../i18n';
import { act, api, type ConfigSection, openDeptModel, openHire, openNewDept, openSetup, setLanguage, setTheme, toast, useOffice, useT } from '../store';
import type { AppInfo, Department, DiscoveredRepo, Employee, Provider, Settings } from '../types';
import { EffortSelect, ModelSelect, ModelsStatus } from './EmployeeSettings';
import { EmployeeSettings } from './EmployeeSettings';
import { Icon, type IconName } from './icons';
import { Avatar, Button, Card, Chip, ConfirmButton, cx, Empty, Field, Input, Saved, Segmented, Select, SettingRow, Stepper, Switch } from './ui';

const SECTIONS: { value: ConfigSection; icon: IconName }[] = [
  { value: 'team', icon: 'users' },
  { value: 'import', icon: 'download' },
  { value: 'providers', icon: 'server' },
  { value: 'office', icon: 'sliders' },
  { value: 'about', icon: 'info' },
];

export function ConfigTab() {
  const t = useT();
  const pref = useOffice((s) => s.configSection);
  const empty = useOffice((s) => s.state.departments.length === 0);
  const update = useOffice((s) => s.state.app.available);
  const [section, setSection] = useState<ConfigSection>(() => pref ?? (empty ? 'import' : 'team'));
  useEffect(() => {
    if (!pref) return;
    setSection(pref);
    useOffice.setState({ configSection: null });
  }, [pref]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Navegação: lista lateral no desktop, faixa rolável no celular. */}
      <nav className="shrink-0 border-b border-zinc-200 bg-white lg:w-64 lg:border-r lg:border-b-0 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="hidden px-5 pt-6 pb-3 text-xl font-semibold lg:block">{t.config.title}</h1>
        <div className="flex gap-1 overflow-x-auto p-2 lg:grid lg:p-3">
          {SECTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSection(s.value)}
              aria-current={section === s.value}
              className={cx(
                'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                section === s.value ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900',
              )}
            >
              <Icon name={s.icon} className="h-4 w-4" />
              <span className="min-w-0">
                <span className="block font-medium">{t.config.sections[s.value]}</span>
                <span className="hidden truncate text-xs opacity-70 lg:block">{t.config.sectionHints[s.value]}</span>
              </span>
              {s.value === 'about' && update && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div key={section} className="mx-auto grid max-w-3xl animate-rise gap-5 p-4 sm:p-6">
          {section === 'team' && <TeamSection />}
          {section === 'import' && <ImportSection onDone={() => setSection('team')} />}
          {section === 'providers' && <ProvidersSection />}
          {section === 'office' && <SettingsSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

// ---------- equipe: departamentos com seus funcionários ----------

function TeamSection() {
  const t = useT();
  const { departments, employees } = useOffice((s) => s.state);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t.config.sections.team}</h2>
          <p className="text-sm text-zinc-500">{t.config.summary(departments.length, employees.length)}</p>
        </div>
        <div className="flex gap-2">
          <Button icon="folderPlus" onClick={() => openNewDept()}>
            {t.config.newDept}
          </Button>
          <Button variant="primary" icon="userPlus" disabled={!departments.length} onClick={() => openHire()}>
            {t.config.hire}
          </Button>
        </div>
      </div>

      {departments.length === 0 && (
        <Card>
          <Empty
            icon="building"
            title={t.config.emptyTitle}
            action={
              <Button variant="primary" icon="sparkles" onClick={() => openSetup()}>
                {t.config.startSetup}
              </Button>
            }
          >
            {t.config.emptyText}
          </Empty>
        </Card>
      )}

      {departments.map((d) => (
        <DepartmentCard key={d.id} d={d} team={employees.filter((e) => e.department_id === d.id)} />
      ))}
    </>
  );
}

function DepartmentCard({ d, team }: { d: Department; team: Employee[] }) {
  const t = useT();
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full shadow-sm ring-2 ring-white transition hover:scale-110 dark:ring-zinc-900" style={{ background: d.color }} title={t.config.changeColor}>
          <input type="color" value={d.color} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => act(() => api('PATCH', `/api/departments/${d.id}`, { color: e.target.value }))} />
        </label>
        <input
          defaultValue={d.name}
          key={d.name}
          aria-label={t.dept.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && act(() => api('PATCH', `/api/departments/${d.id}`, { name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
        />
        <span className="text-xs text-zinc-500">{t.config.employees(team.length)}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon="userPlus" onClick={() => openHire(d.id)}>
            {t.config.hire}
          </Button>
          <Button size="sm" variant="ghost" icon="sliders" disabled={!team.length} title={t.config.deptModelTitle} onClick={() => openDeptModel(d.id)}>
            {t.config.deptModel}
          </Button>
          <ConfirmButton size="sm" icon="trash" confirm={t.config.removeDeptQ(team.length)} onConfirm={() => act(() => api('DELETE', `/api/departments/${d.id}`))}>
            <span className="sr-only">{t.common.remove}</span>
          </ConfirmButton>
        </div>
      </div>
      <div className="border-t border-zinc-100 dark:border-zinc-800">
        {team.map((e) => (
          <EmployeeRow key={e.id} e={e} color={d.color} />
        ))}
        {!team.length && (
          <button onClick={() => openHire(d.id)} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-zinc-500 transition hover:bg-zinc-50 hover:text-blue-600 dark:hover:bg-zinc-800/40">
            <Icon name="plus" className="h-4 w-4" /> {t.config.noEmployees} {t.config.hire}…
          </button>
        )}
      </div>
    </section>
  );
}

function EmployeeRow({ e, color }: { e: Employee; color: string }) {
  const t = useT();
  const { providers, settings } = useOffice((s) => s.state);
  const [open, setOpen] = useState(false);
  const provider = providers.find((p) => p.id === e.provider_id);
  return (
    <div className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
        <Avatar name={e.name} color={color} size="sm" activity={e.activity} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{e.name}</div>
          <div className="truncate text-xs text-zinc-500">{e.kind === 'intern' ? e.profile.split('\n')[0] || t.common.intern : (e.git_remote ?? e.repo_path)}</div>
        </div>
        <div className="hidden flex-wrap justify-end gap-1 sm:flex">
          {e.kind === 'intern' && (
            <Chip tone="violet" icon="intern">
              {t.common.intern}
            </Chip>
          )}
          <Chip>{provider ? provider.name : (e.model ?? settings.defaultModel)}</Chip>
          {e.effort && <Chip>{t.employee.efforts[e.effort] ?? e.effort}</Chip>}
          {!!e.auto_edit && <Chip tone="blue">auto-edit</Chip>}
          {e.isolation === 'worktree' && (
            <Chip tone="green" icon="branch">
              worktree
            </Chip>
          )}
          {e.max_parallel > 1 && <Chip>{e.max_parallel}×</Chip>}
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
  const t = useT();
  return (
    <Card title={t.import.title} description={t.import.description}>
      <RepoImporter onHired={onDone} />
    </Card>
  );
}

// Lista os repositórios git de uma pasta e contrata os marcados, cada um no departamento escolhido.
// preferExisting: sem departamento com o nome sugerido, cai no primeiro existente (assistente) em vez de criar um.
export function RepoImporter({ onHired, preferExisting }: { onHired?: () => void; preferExisting?: boolean }) {
  const t = useT();
  const settings = useOffice((s) => s.state.settings);
  const departments = useOffice((s) => s.state.departments);
  const [root, setRoot] = useState('');
  const [repos, setRepos] = useState<DiscoveredRepo[] | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({}); // repoPath → nome do departamento
  const [busy, setBusy] = useState(false);

  const known = (name: string) => departments.find((d) => d.name.toLowerCase() === name.toLowerCase())?.name;
  const defaultDept = (r: DiscoveredRepo) => known(r.suggestedDepartment) ?? (preferExisting && departments[0]?.name) ?? r.suggestedDepartment;

  const scan = async (dir = root || settings.importRoot) => {
    setBusy(true);
    const r = await act(() => api<{ repos: DiscoveredRepo[] }>('GET', `/api/discover?root=${encodeURIComponent(dir)}`));
    setBusy(false);
    if (!r) return setRepos([]);
    // Pré-marca (e lista primeiro) o que cai num departamento que já existe.
    const isKnown = (x: DiscoveredRepo) => !!known(x.suggestedDepartment);
    setRepos(r.repos.toSorted((a, b) => Number(isKnown(b)) - Number(isKnown(a))));
    setPicked(Object.fromEntries(r.repos.filter((x) => !x.employedAs && !x.duplicateOf && isKnown(x)).map((x) => [x.repoPath, known(x.suggestedDepartment)!])));
  };
  useEffect(() => {
    scan(settings.importRoot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hire = async () => {
    const items = Object.entries(picked).map(([repoPath, department]) => ({ repoPath, department }));
    setBusy(true);
    const results = await act(() => api<{ repoPath: string; ok: boolean; error?: string }[]>('POST', '/api/import', { items }));
    setBusy(false);
    if (!results) return;
    const failed = results.filter((r) => !r.ok);
    toast(
      `${t.import.hired(results.length - failed.length)}${failed.length ? t.import.failures(failed.map((f) => `${f.repoPath.split('/').pop()} (${f.error})`).join('; ')) : ''}`,
      failed.length ? 'error' : 'success',
      failed.length || !onHired ? undefined : { label: t.import.viewTeam, run: onHired },
    );
    setPicked({});
    scan();
  };

  const available = repos?.filter((r) => !r.employedAs && !r.duplicateOf) ?? [];
  const count = Object.keys(picked).length;

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          scan();
        }}
      >
        <div className="relative flex-1">
          <Icon name="folder" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder={settings.importRoot} value={root} onChange={(e) => setRoot(e.target.value)} className="pl-9 font-mono" />
        </div>
        <Button type="submit" icon="search" busy={busy && !repos}>
          {t.import.search}
        </Button>
      </form>

      {repos && repos.length === 0 && <Empty>{t.import.noneFound}</Empty>}
      {repos && repos.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>{t.import.found(repos.length, available.length)}</span>
            {available.length > 0 && (
              <button
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                onClick={() => setPicked(count === available.length ? {} : Object.fromEntries(available.map((r) => [r.repoPath, picked[r.repoPath] ?? defaultDept(r)])))}
              >
                {count === available.length ? t.import.unselectAll : t.import.selectAll}
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            {repos.map((r) => {
              const blocked = r.employedAs ? t.import.already(r.employedAs) : r.duplicateOf ? t.import.sameRemote(r.duplicateOf) : null;
              const on = r.repoPath in picked;
              const value = picked[r.repoPath] ?? defaultDept(r);
              return (
                <label
                  key={r.repoPath}
                  className={cx(
                    'flex flex-wrap items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm transition-colors last:border-0 sm:flex-nowrap dark:border-zinc-800',
                    blocked ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40',
                    on && 'bg-blue-50/60 dark:bg-blue-950/20',
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    disabled={!!blocked}
                    checked={on}
                    onChange={(e) => setPicked(({ [r.repoPath]: _, ...rest }) => (e.target.checked ? { ...rest, [r.repoPath]: value } : rest))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-zinc-500">{r.remote ?? t.import.noRemote}</div>
                  </div>
                  <div className="w-full shrink-0 sm:w-48">
                    {blocked ? (
                      <Chip>{blocked}</Chip>
                    ) : (
                      <Select value={value} disabled={!on} onChange={(e) => setPicked((p) => ({ ...p, [r.repoPath]: e.target.value }))} className="h-8 py-1">
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                        {!known(value) && <option value={value}>+ {value}</option>}
                      </Select>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">{t.import.note}</span>
            <Button variant="primary" icon="users" busy={busy} disabled={!count} onClick={hire}>
              {t.import.hireN(count)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- provedores ----------

const BLANK = { name: '', format: 'openai' as Provider['format'], baseUrl: '', apiKey: '', model: '', smallModel: '', contextWindow: '', maxParallel: '1' };
// O Ollama fala a API da Anthropic direto. A janela precisa bater com o contexto carregado nele (OLLAMA_CONTEXT_LENGTH).
const OLLAMA: typeof BLANK = { ...BLANK, name: 'Ollama', format: 'anthropic', baseUrl: 'http://127.0.0.1:11434', contextWindow: '65536' };
const isLocal = (url: string) => /\/\/(127\.0\.0\.1|localhost)\b/.test(url);

function ProvidersSection() {
  const t = useT();
  const providers = useOffice((s) => s.state.providers);
  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [found, setFound] = useState<string[]>([]); // modelos que o provedor anuncia, só como sugestão
  const bind = (k: keyof typeof BLANK) => ({ value: form?.[k] ?? '', onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...(f ?? BLANK), [k]: e.target.value })) });
  const loadModels = (f: typeof BLANK, id = editing) => f.baseUrl.trim() && api<string[]>('POST', '/api/providers/models', { ...f, id }).then(setFound, () => setFound([]));
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
        title={t.providers.title}
        description={t.providers.description}
        actions={
          !form && (
            <div className="flex gap-2">
              <Button size="sm" icon="server" onClick={() => open(OLLAMA)}>
                {t.providers.ollama}
              </Button>
              <Button size="sm" icon="plus" onClick={() => open(BLANK)}>
                {t.providers.new}
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
                  {!p.has_key && !isLocal(p.base_url) && <Chip tone="amber">{t.providers.noKey}</Chip>}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {p.base_url} · {p.model}
                  {p.small_model ? ` / ${p.small_model}` : ''}
                  {p.context_window ? ` · ${Math.round(p.context_window / 1000)}K` : ''}
                  {` · ${t.providers.perTask(p.max_parallel)}`}
                </div>
              </div>
              <Button
                size="sm"
                icon="pencil"
                onClick={() =>
                  open(
                    { name: p.name, format: p.format, baseUrl: p.base_url, apiKey: '', model: p.model, smallModel: p.small_model ?? '', contextWindow: p.context_window ? String(p.context_window) : '', maxParallel: String(p.max_parallel) },
                    p.id,
                  )
                }
              >
                {t.common.edit}
              </Button>
              <ConfirmButton size="sm" icon="trash" confirm={t.common.removeQ} onConfirm={() => act(() => api('DELETE', `/api/providers/${p.id}`))}>
                <span className="sr-only">{t.common.remove}</span>
              </ConfirmButton>
            </div>
          ))}
          {providers.length === 0 && !form && (
            <Empty icon="server" title={t.providers.empty}>
              {t.providers.emptyText}
            </Empty>
          )}
        </div>
      </Card>

      {form && (
        <Card title={editing ? t.providers.edit : t.providers.new} className="animate-rise">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await act(() => (editing ? api('PATCH', `/api/providers/${editing}`, form) : api('POST', '/api/providers', form)));
              if (ok) {
                toast(editing ? t.providers.updated : t.providers.added, 'success');
                close();
              }
            }}
          >
            <Field label={t.providers.name}>
              <Input placeholder={t.providers.namePlaceholder} required autoFocus {...bind('name')} />
            </Field>
            <Field group label={t.providers.format}>
              <Segmented
                value={form.format}
                onChange={(format) => setForm({ ...form, format })}
                className="w-full [&>button]:flex-1"
                size="sm"
                options={[
                  { value: 'openai', label: t.providers.openai },
                  { value: 'anthropic', label: t.providers.anthropic },
                ]}
              />
            </Field>
            <Field label={t.providers.baseUrl} hint={form.format === 'openai' ? t.providers.baseUrlOpenai : t.providers.baseUrlAnthropic}>
              <Input required {...bind('baseUrl')} onBlur={() => loadModels(form)} />
            </Field>
            <Field label={t.providers.apiKey} hint={editing ? t.providers.keyKeep : isLocal(form.baseUrl) ? t.providers.keyLocal : t.providers.keyStored}>
              <Input type="password" autoComplete="off" {...bind('apiKey')} onBlur={() => loadModels(form)} />
            </Field>
            <Field label={t.providers.model} hint={found.length ? t.providers.modelFound(found.length) : t.providers.modelHint}>
              <Input placeholder="gpt-4o" required list="provider-models" {...bind('model')} />
            </Field>
            <Field label={t.providers.small} hint={t.providers.smallHint}>
              <Input placeholder="gpt-4o-mini" list="provider-models" {...bind('smallModel')} />
            </Field>
            <Field label={t.providers.context} hint={t.providers.contextHint}>
              <Input inputMode="numeric" placeholder="65536" {...bind('contextWindow')} />
            </Field>
            <Field label={t.providers.parallel} hint={t.providers.parallelHint}>
              <Input inputMode="numeric" placeholder="1" {...bind('maxParallel')} />
            </Field>
            <datalist id="provider-models">
              {found.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={close}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="primary">
                {editing ? t.common.save : t.providers.add}
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
  const t = useT();
  const settings = useOffice((s) => s.state.settings);
  const theme = useOffice((s) => s.theme);
  const lang = useOffice((s) => s.lang);
  const [importRoot, setImportRoot] = useState(settings.importRoot);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => setImportRoot(settings.importRoot), [settings.importRoot]);
  const save = async (patch: Partial<Settings>) => {
    if ((await act(() => api('PATCH', '/api/settings', patch))) !== undefined) setSavedAt(Date.now());
  };

  return (
    <>
      <Card title={t.settings.general} actions={<Saved at={savedAt} />}>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title={t.settings.language} description={t.settings.languageHint}>
            <Segmented size="sm" value={lang} onChange={(l) => setLanguage(l)} options={LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))} />
          </SettingRow>
          <SettingRow title={t.settings.theme}>
            <Segmented
              size="sm"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: t.app.themes.light, icon: 'sun' },
                { value: 'dark', label: t.app.themes.dark, icon: 'moon' },
                { value: 'system', label: t.app.themes.system, icon: 'monitor' },
              ]}
            />
          </SettingRow>
          <SettingRow title={t.settings.importRoot} description={t.settings.importRootHint}>
            <Input className="w-64 font-mono" value={importRoot} onChange={(e) => setImportRoot(e.target.value)} onBlur={() => importRoot !== settings.importRoot && save({ importRoot })} />
          </SettingRow>
          <SettingRow title={t.settings.setup} description={t.settings.setupHint}>
            <Button size="sm" icon="sparkles" onClick={() => openSetup()}>
              {t.settings.openSetup}
            </Button>
          </SettingRow>
        </div>
      </Card>

      <Card title={t.settings.execution}>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title={t.settings.concurrent} description={t.settings.concurrentHint}>
            <Stepper value={settings.maxConcurrent} min={1} max={20} onChange={(maxConcurrent) => save({ maxConcurrent })} />
          </SettingRow>
          <SettingRow title={t.settings.delegation} description={t.settings.delegationHint}>
            <Switch label={t.settings.delegation} checked={settings.delegationNeedsApproval} onChange={(delegationNeedsApproval) => save({ delegationNeedsApproval })} />
          </SettingRow>
          <SettingRow title={t.settings.readOnly} description={t.settings.readOnlyHint}>
            <Switch label={t.settings.readOnly} checked={settings.autoAllowReadOnly} onChange={(autoAllowReadOnly) => save({ autoAllowReadOnly })} />
          </SettingRow>
          <SettingRow title={t.settings.onlyExternal} description={t.settings.onlyExternalHint}>
            <Switch label={t.settings.onlyExternal} checked={settings.onlyAskExternal} onChange={(onlyAskExternal) => save({ onlyAskExternal })} />
          </SettingRow>
        </div>
      </Card>

      <Card title={t.settings.models}>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title={t.settings.defaultModel} description={t.settings.defaultModelHint}>
            <div className="w-56">
              <ModelSelect allowDefault={false} value={settings.defaultModel} onChange={(defaultModel) => save({ defaultModel })} />
            </div>
          </SettingRow>
          <SettingRow title={t.settings.onboardModel} description={t.settings.onboardModelHint}>
            <div className="w-56">
              <ModelSelect allowDefault={false} value={settings.onboardModel} onChange={(onboardModel) => save({ onboardModel })} />
            </div>
          </SettingRow>
          <SettingRow title={t.settings.consultModel} description={t.settings.consultModelHint}>
            <div className="w-56">
              <ModelSelect allowDefault={false} emptyLabel={t.settings.colleagueModel} value={settings.consultModel} onChange={(consultModel) => save({ consultModel })} />
            </div>
          </SettingRow>
          <SettingRow title={t.settings.defaultEffort} description={t.settings.defaultEffortHint}>
            <div className="w-56">
              <EffortSelect allowDefault={false} value={settings.defaultEffort} onChange={(defaultEffort) => save({ defaultEffort })} />
            </div>
          </SettingRow>
          <SettingRow title={t.settings.compact} description={t.settings.compactHint}>
            <Stepper value={settings.compactWindow / 1000} min={0} max={1000} step={25} onChange={(k) => save({ compactWindow: k * 1000 })} />
          </SettingRow>
          <SettingRow title={t.settings.refreshProfiles} description={t.settings.refreshProfilesHint}>
            <Stepper value={settings.profileRefreshCommits} min={0} max={1000} step={10} onChange={(profileRefreshCommits) => save({ profileRefreshCommits })} />
          </SettingRow>
          <div className="pt-3">
            <ModelsStatus />
          </div>
        </div>
      </Card>

      <Card title={t.settings.notifications}>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow title={t.settings.notifyApprovals} description={t.settings.notifyApprovalsHint}>
            <Switch label={t.settings.notifyApprovals} checked={settings.notifyApprovals} onChange={(notifyApprovals) => save({ notifyApprovals })} />
          </SettingRow>
          <SettingRow title={t.settings.notifyFinished} description={t.settings.notifyFinishedHint}>
            <Switch label={t.settings.notifyFinished} checked={settings.notifyTaskFinished} onChange={(notifyTaskFinished) => save({ notifyTaskFinished })} />
          </SettingRow>
        </div>
      </Card>
    </>
  );
}

// ---------- versão e atualização ----------

const REPO_URL = 'https://github.com/alissonpelizaro/my-local-office';

function AboutSection() {
  const t = useT();
  const app = useOffice((s) => s.state.app);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    await act(() => api<AppInfo>('POST', '/api/update/check'));
    setChecking(false);
  };

  return (
    <Card>
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25">
          <Icon name="building" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{t.about.title}</h2>
          <p className="text-sm text-zinc-500">{t.about.version(app.version)}</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
            {t.about.repo} <Icon name="external" className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div
        className={cx(
          'mt-5 grid gap-3 rounded-xl border p-4 text-sm',
          app.available ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-zinc-200 dark:border-zinc-800',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Icon name={app.available ? 'update' : 'circleCheck'} className={cx('h-5 w-5', app.available ? 'text-emerald-600' : 'text-zinc-400')} />
          <span className="flex-1 font-medium">{app.available && app.latest ? t.about.available(app.latest) : t.about.upToDate}</span>
          {app.releaseUrl && (
            <a href={app.releaseUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              {t.about.notes}
            </a>
          )}
        </div>
        {app.error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{t.about.error(app.error)}</p>}
        {app.available && !app.canUpdate && <p className="text-xs text-zinc-500">{t.about.fromSource}</p>}
        {app.available && app.canUpdate && <p className="text-xs text-zinc-600 dark:text-zinc-400">{t.about.updateHint}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {app.available && app.canUpdate && (
            <ConfirmButton icon="update" idle="primary" armedVariant="solidDanger" busy={app.updating} confirm={t.about.updateQ} onConfirm={() => act(() => api('POST', '/api/update'))}>
              {t.about.update}
            </ConfirmButton>
          )}
          <Button icon="refresh" busy={checking} onClick={check}>
            {t.about.check}
          </Button>
          <span className="text-xs text-zinc-400">{app.checkedAt ? t.about.lastChecked(ago(app.checkedAt)) : t.about.neverChecked}</span>
        </div>
      </div>
    </Card>
  );
}
