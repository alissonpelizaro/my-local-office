// Diálogos da equipe: contratar (repositório ou estagiário), novo departamento e modelo do departamento inteiro.
import { useEffect, useRef, useState } from 'react';
import { act, api, closeHire, openDeptModel, openNewDept, selectEmployee, toast, useOffice, useT } from '../store';
import type { Department, DiscoveredRepo, Employee } from '../types';
import { ModelSelect, ProviderSelect } from './EmployeeSettings';
import { Icon, type IconName } from './icons';
import { Button, ConfirmButton, cx, Field, Input, Modal, Select, Textarea } from './ui';

export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

function DialogShell({ open, onClose, title, icon, children }: { open: boolean; onClose: () => void; title: string; icon: IconName; children: React.ReactNode }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} className="w-[min(560px,calc(100vw-2rem))]">
      <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
            <Icon name={icon} className="h-5 w-5" />
          </span>
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" icon="x" onClick={onClose} aria-label={t.common.close} />
        </div>
        {children}
      </div>
    </Modal>
  );
}

// Escolha entre dois tipos, com descrição: mais claro que um segmentado para quem contrata pela primeira vez.
function KindCard({ on, icon, title, text, onClick }: { on: boolean; icon: IconName; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'flex items-start gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99]',
        on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:bg-blue-950/40' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600',
      )}
    >
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', on ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800')}>
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{text}</span>
      </span>
    </button>
  );
}

// Repositórios disponíveis na pasta padrão de importação, para escolher com um clique.
function useAvailableRepos(enabled: boolean) {
  const root = useOffice((s) => s.state.settings.importRoot);
  const [repos, setRepos] = useState<DiscoveredRepo[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setRepos(null);
    api<{ repos: DiscoveredRepo[] }>('GET', `/api/discover?root=${encodeURIComponent(root)}`).then(
      (r) => setRepos(r.repos.filter((x) => !x.employedAs && !x.duplicateOf)),
      () => setRepos([]),
    );
  }, [enabled, root]);
  return { root, repos };
}

export function HireDialog() {
  const t = useT();
  const hire = useOffice((s) => s.hire);
  const departments = useOffice((s) => s.state.departments);
  const [kind, setKind] = useState<Employee['kind']>('repo');
  const [dept, setDept] = useState<number | ''>('');
  const [repoPath, setRepoPath] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const { root, repos } = useAvailableRepos(!!hire && kind === 'repo');

  useEffect(() => {
    if (!hire) return;
    setKind('repo');
    setDept(hire.departmentId ?? departments[0]?.id ?? '');
    setRepoPath('');
    setName('');
    setRole('');
  }, [hire]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!dept && !busy && (kind === 'repo' ? !!repoPath.trim() : !!name.trim());
  const shown = (repos ?? []).filter((r) => !repoPath || r.repoPath.toLowerCase().includes(repoPath.toLowerCase()) || r.name.toLowerCase().includes(repoPath.toLowerCase())).slice(0, 8);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const body = kind === 'repo' ? { kind, departmentId: dept, repoPath, name: name || undefined } : { kind, departmentId: dept, name, profile: role };
    const e = await act(() => api<Employee>('POST', '/api/employees', body));
    setBusy(false);
    if (!e) return;
    toast(kind === 'repo' ? t.hire.hiredRepo(e.name) : t.hire.hiredIntern(e.name), 'success', { label: t.common.edit, run: () => selectEmployee(e.id) });
    closeHire();
  };

  return (
    <DialogShell open={!!hire} onClose={closeHire} title={t.hire.title} icon="userPlus">
      <form
        className="grid gap-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <KindCard on={kind === 'repo'} icon="folder" title={t.hire.kindRepo} text={t.hire.kindRepoDesc} onClick={() => setKind('repo')} />
          <KindCard on={kind === 'intern'} icon="intern" title={t.hire.kindIntern} text={t.hire.kindInternDesc} onClick={() => setKind('intern')} />
        </div>

        <Field label={t.hire.department}>
          <Select
            value={dept}
            onChange={(ev) => {
              if (ev.target.value === 'new') return openNewDept();
              setDept(Number(ev.target.value));
            }}
          >
            {!departments.length && <option value="">—</option>}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="new">{t.hire.newDeptOption}</option>
          </Select>
        </Field>

        {kind === 'repo' ? (
          <div key="repo" className="grid animate-fade-in gap-4">
            <Field label={t.hire.repoPath} hint={t.hire.repoPathHint}>
              <div className="relative">
                <Icon name="folder" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input autoFocus className="pl-9 font-mono" placeholder="~/projects/my-repo" value={repoPath} onChange={(ev) => setRepoPath(ev.target.value)} />
              </div>
            </Field>
            <div className="grid gap-1.5">
              <span className="text-xs text-zinc-500">
                {t.hire.findIn} <code>{root}</code>
              </span>
              {repos === null ? (
                <div className="h-9 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              ) : shown.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {shown.map((r) => (
                    <button
                      type="button"
                      key={r.repoPath}
                      onClick={() => setRepoPath(r.repoPath)}
                      title={r.remote ?? r.repoPath}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-95',
                        repoPath === r.repoPath ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700',
                      )}
                    >
                      <Icon name="branch" className="h-3 w-3" />
                      {r.name}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-zinc-400">{t.hire.none}</span>
              )}
            </div>
            <Field label={t.hire.nameOptional} hint={t.hire.nameHint}>
              <Input value={name} onChange={(ev) => setName(ev.target.value)} />
            </Field>
          </div>
        ) : (
          <div key="intern" className="grid animate-fade-in gap-4">
            <Field label={t.hire.name}>
              <Input autoFocus placeholder={t.hire.internName} value={name} onChange={(ev) => setName(ev.target.value)} />
            </Field>
            <Field label={t.hire.role} hint={t.employee.roleHint}>
              <Textarea rows={3} placeholder={t.hire.rolePlaceholder} value={role} onChange={(ev) => setRole(ev.target.value)} />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button type="button" variant="ghost" onClick={closeHire}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" icon="userPlus" busy={busy} disabled={!ready}>
            {t.hire.hireBtn}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value === c}
          className={cx('h-7 w-7 rounded-full shadow-sm ring-offset-2 transition hover:scale-110 dark:ring-offset-zinc-900', value === c && 'ring-2 ring-zinc-900 dark:ring-white')}
          style={{ background: c }}
        />
      ))}
      <label className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-400 transition hover:scale-110 dark:border-zinc-600" title={t.dept.color}>
        <Icon name="palette" className="h-3.5 w-3.5" />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

export function NewDeptDialog() {
  const t = useT();
  const open = useOffice((s) => s.newDept);
  const count = useOffice((s) => s.state.departments.length);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  useEffect(() => {
    if (!open) return;
    setName('');
    setColor(PALETTE[count % PALETTE.length]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => openNewDept(false);
  return (
    <DialogShell open={open} onClose={close} title={t.dept.newTitle} icon="folderPlus">
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = await act(() => api<Department>('POST', '/api/departments', { name, color }));
          if (!d) return;
          toast(t.dept.created(d.name), 'success');
          // Aberto de dentro da contratação: o departamento novo já fica escolhido nela.
          useOffice.setState((s) => (s.hire ? { hire: { departmentId: d.id } } : {}));
          close();
        }}
      >
        <Field label={t.dept.name}>
          <Input autoFocus required placeholder={t.dept.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field group label={t.dept.color}>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button type="button" variant="ghost" onClick={close}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" icon="plus" disabled={!name.trim()}>
            {t.common.create}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

// Provedor e modelo do departamento inteiro: aplica em todos de uma vez, com confirmação.
export function DeptModelDialog() {
  const t = useT();
  const id = useOffice((s) => s.deptModel);
  const dept = useOffice((s) => s.state.departments.find((d) => d.id === id));
  const team = useOffice((s) => s.state.employees).filter((e) => e.department_id === id);
  const [providerId, setProviderId] = useState<number | null>(null);
  const [model, setModel] = useState('');
  const last = useRef(dept);
  if (dept) last.current = dept;

  useEffect(() => {
    if (id == null) return;
    // Todos iguais: começa no que já usam; misturado, no padrão.
    const same = <T,>(f: (e: Employee) => T) => (team.length && team.every((e) => f(e) === f(team[0])) ? f(team[0]) : null);
    setProviderId(same((e) => e.provider_id));
    setModel(same((e) => e.model) ?? '');
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => openDeptModel(null);
  return (
    <DialogShell open={id != null} onClose={close} title={t.dept.modelTitle(last.current?.name ?? '')} icon="sliders">
      <div className="grid gap-5">
        <p className="text-sm text-zinc-500">{t.dept.modelText(team.length)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.employee.provider}>
            <ProviderSelect value={providerId} onChange={setProviderId} />
          </Field>
          <Field label={t.employee.model} hint={providerId ? t.employee.modelHint : undefined}>
            <ModelSelect value={model} onChange={setModel} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button type="button" variant="ghost" onClick={close}>
            {t.common.cancel}
          </Button>
          <ConfirmButton
            icon="check"
            idle="primary"
            armedVariant="primary"
            disabled={!team.length}
            confirm={t.dept.applyQ(team.length)}
            onConfirm={async () => {
              const r = await act(() => api<{ updated: number }>('POST', `/api/departments/${id}/model`, { providerId, model }));
              if (!r) return;
              toast(t.dept.applied(r.updated), 'success');
              close();
            }}
          >
            {t.dept.apply}
          </ConfirmButton>
        </div>
      </div>
    </DialogShell>
  );
}
