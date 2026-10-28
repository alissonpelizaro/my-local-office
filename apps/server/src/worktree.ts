// Worktrees por task: o agente trabalha numa cópia isolada do repo, sem mexer na sua cópia principal
// nem disputar a pasta com outra task do mesmo funcionário.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, type Employee } from './db.ts';
import { git } from './git.ts';

const ROOT = path.join(DATA, 'worktrees');

export type Worktree = { dir: string; base: string };

export const worktreeDir = (e: Employee, taskId: number) => path.join(ROOT, e.name.replace(/[^\w.-]/g, '_'), `task-${taskId}`);

export function createWorktree(e: Employee, dir: string): Worktree {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const base = git(e.repo_path, 'rev-parse', 'HEAD');
  // HEAD destacado: o agente cria a branch dele (Conventional Commits) se for commitar.
  git(e.repo_path, 'worktree', 'add', '--detach', dir, base);
  // Allowlists locais (.claude/settings.local.json) costumam ser ignoradas pelo git e não vêm no checkout.
  const local = path.join(e.repo_path, '.claude', 'settings.local.json');
  if (fs.existsSync(local) && isIgnored(dir, '.claude/settings.local.json')) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.copyFileSync(local, path.join(dir, '.claude', 'settings.local.json'));
  }
  return { dir, base };
}

function isIgnored(dir: string, file: string) {
  try {
    git(dir, 'check-ignore', '-q', file);
    return true;
  } catch {
    return false;
  }
}

// Sem mudanças e sem commits novos, o worktree é descartado. Com trabalho, fica até o chefe decidir.
export function releaseWorktree(repo: string, wt: Worktree): boolean {
  if (!fs.existsSync(wt.dir)) return true;
  try {
    if (git(wt.dir, 'status', '--porcelain') || git(wt.dir, 'rev-parse', 'HEAD') !== wt.base) return false;
    git(repo, 'worktree', 'remove', wt.dir);
    return true;
  } catch {
    return false;
  }
}

// Sem --force: com mudanças não commitadas o git recusa e nada se perde.
export function removeWorktree(repo: string, dir: string) {
  if (fs.existsSync(dir)) git(repo, 'worktree', 'remove', dir);
  else git(repo, 'worktree', 'prune');
}
