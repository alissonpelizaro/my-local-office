// Importação em lote: lista os repos git de uma pasta, sugere departamento e contrata os escolhidos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { all, type Department, type Employee, get } from './db.ts';
import { git } from './git.ts';
import { msg } from './i18n.ts';
import { createDepartment, createEmployee, HttpError } from './office.ts';

const expand = (p: string) => p.replace(/^~(?=\/|$)/, os.homedir());

// git@github.com:org/repo.git, https://github.com/org/repo(.git)
export function parseRemote(url: string | null) {
  const m = url?.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { org: m[1], repo: m[2] } : null;
}

export type DiscoveredRepo = {
  repoPath: string;
  name: string;
  remote: string | null;
  org: string | null;
  employedAs: string | null;
  duplicateOf: string | null;
  suggestedDepartment: string;
};

export function discover(root: string): { root: string; repos: DiscoveredRepo[] } {
  const dir = expand(root);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new HttpError(400, msg().cannotRead(dir));
  }
  const employees = all<Employee>('SELECT * FROM employees');
  const depts = all<Department>('SELECT * FROM departments');
  // Departamento organizado por org (Platform ← acme/*) puxa os repos irmãos. Departamento nomeado pelo projeto
  // (Billing ← billing*) só puxa por prefixo, senão levaria junto todos os repos pessoais da mesma conta.
  const orgDept = new Map<string, string>();
  for (const e of employees) {
    const org = parseRemote(e.git_remote)?.org;
    const d = depts.find((d) => d.id === e.department_id);
    if (org && d && !path.basename(e.repo_path).toLowerCase().startsWith(d.name.toLowerCase())) orgDept.set(org, d.name);
  }

  const repos: (DiscoveredRepo & { repo: string | null })[] = [];
  for (const ent of entries) {
    const repoPath = path.join(dir, ent.name);
    if (!ent.isDirectory() || ent.name.startsWith('.') || !fs.existsSync(path.join(repoPath, '.git'))) continue;
    let remote: string | null = null;
    try {
      remote = git(repoPath, 'remote', 'get-url', 'origin');
    } catch {}
    const parsed = parseRemote(remote);
    const employed = employees.find((e) => e.repo_path === repoPath || (remote && e.git_remote === remote));
    const byPrefix = depts.find((d) => ent.name.toLowerCase().startsWith(d.name.toLowerCase()));
    repos.push({
      repoPath,
      name: ent.name,
      remote,
      org: parsed?.org ?? null,
      repo: parsed?.repo ?? null,
      employedAs: employed?.name ?? null,
      duplicateOf: null,
      suggestedDepartment: byPrefix?.name ?? (parsed && orgDept.get(parsed.org)) ?? parsed?.org ?? 'Other',
    });
  }

  // Clones/worktrees do mesmo remote viram um funcionário só: fica a pasta com o nome do repo (billing, não billing-old).
  const byRemote = Map.groupBy(repos.filter((r) => r.remote), (r) => r.remote!);
  for (const group of byRemote.values()) {
    if (group.length < 2) continue;
    const canonical = group.find((r) => r.employedAs) ?? group.find((r) => r.name === r.repo) ?? group.toSorted((a, b) => a.name.length - b.name.length)[0];
    for (const r of group) if (r !== canonical) r.duplicateOf = canonical.employedAs ?? canonical.name;
  }
  return { root: dir, repos: repos.map(({ repo, ...r }) => r).sort((a, b) => a.suggestedDepartment.localeCompare(b.suggestedDepartment) || a.name.localeCompare(b.name)) };
}

export function importRepos(items: { repoPath: string; department: string }[]) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, msg().nothingToImport);
  return items.map(({ repoPath, department }) => {
    try {
      const name = String(department ?? '').trim() || 'Other';
      const dept = get<Department>('SELECT * FROM departments WHERE name = ? COLLATE NOCASE', name) ?? createDepartment({ name })!;
      const e = createEmployee({ departmentId: dept.id, repoPath });
      return { repoPath, ok: true, employee: e.name };
    } catch (err) {
      return { repoPath, ok: false, error: (err as Error).message };
    }
  });
}
