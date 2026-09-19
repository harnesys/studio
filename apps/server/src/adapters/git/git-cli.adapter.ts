import type {
  GitBranch,
  GitDiffResponse,
  GitFileStatusMap,
  GitStatusResponse,
} from '@harnesys/studio-shared';
import {
  GitBranchExistsError,
  GitBranchInvalidError,
  GitDirtyError,
} from '../../domain/git.error.ts';
import type { GitPort } from '../../domain/git.port.ts';
import { getDiff } from './git-diff.ts';
import { execGit, execGitTrim } from './git-exec.ts';
import { getFileStatus, getMtimeKey, getStatus } from './git-status.ts';

type StatusCache = {
  map: GitFileStatusMap;
  truncated: boolean;
  mtimeKey: string;
  ts: number;
  slowCount: number;
};
export class GitCliAdapter implements GitPort {
  private readonly statusCache = new Map<string, StatusCache>();
  private gitVersionCache: string | null | undefined = undefined;
  async getStatus(cwd: string): Promise<GitStatusResponse> {
    const safeCwd = await this.resolveCwd(cwd);
    return getStatus(
      safeCwd,
      (c) => this.getAheadBehind(c),
      () => this.getVersion(),
      (c) => this.listBranches(c),
    );
  }
  async getFileStatus(
    cwd: string,
    subPath?: string,
  ): Promise<{
    map: GitFileStatusMap;
    truncated: boolean;
  }> {
    const safeCwd = await this.resolveCwd(cwd);
    return getFileStatus(safeCwd, this.statusCache, (c) => getMtimeKey(c), subPath);
  }
  async listBranches(cwd: string): Promise<{
    local: GitBranch[];
    recent: GitBranch[];
  }> {
    const safeCwd = await this.resolveCwd(cwd);
    const current = await execGitTrim(safeCwd, ['branch', '--show-current']).catch(() => '');
    const raw = await execGitTrim(safeCwd, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)',
      'refs/heads',
    ]).catch(() => '');
    let names = raw ? raw.split('\n').filter(Boolean) : [];
    if (names.length === 0) {
      const fb = await execGitTrim(safeCwd, ['branch', '--format=%(refname:short)']).catch(
        () => '',
      );
      names = fb ? fb.split('\n').filter(Boolean) : [];
    }
    if (names.length === 0 && current) {
      names = [current];
    }
    const local: GitBranch[] = names.map((n) => ({
      name: n.trim(),
      current: n.trim() === current,
    }));
    return { local, recent: local.slice(0, 5) };
  }
  async checkout(cwd: string, branch: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    if (!branch || branch.includes('\0') || branch.includes('\n')) {
      throw new GitBranchInvalidError('invalid branch name');
    }
    const res = await execGit(safeCwd, ['checkout', branch]);
    if (res.code === 0) {
      this.statusCache.clear();
      return;
    }
    const err = res.stderr + res.stdout;
    if (/already exists/i.test(err)) {
      throw new GitBranchExistsError(err.trim());
    }
    if (/would be overwritten|local changes|needs merge|overwritten by checkout/i.test(err)) {
      throw new GitDirtyError(err.trim());
    }
    throw new Error(err.trim() || `git checkout failed (${res.code})`);
  }
  async createBranch(cwd: string, name: string, checkout: boolean, from?: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const ok = await this.validateBranchName(safeCwd, name);
    if (!ok) {
      throw new GitBranchInvalidError(`invalid branch name: ${name}`);
    }
    const args = checkout ? ['checkout', '-b', name] : ['branch', name];
    if (from) {
      args.push(from);
    }
    const res = await execGit(safeCwd, args);
    if (res.code === 0) {
      this.statusCache.clear();
      return;
    }
    const err = (res.stderr + res.stdout).trim();
    if (/already exists/i.test(err)) {
      throw new GitBranchExistsError(err);
    }
    throw new Error(err || `git branch failed (${res.code})`);
  }
  async stage(cwd: string, paths: string[]): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const clean = paths
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.includes('\0') && !p.includes('\n'));
    if (clean.length === 0) {
      const res = await execGit(safeCwd, ['add', '-A']);
      if (res.code === 0) {
        this.statusCache.clear();
        return;
      }
      throw new Error((res.stderr || res.stdout).trim() || `git add failed (${res.code})`);
    }
    const res = await execGit(safeCwd, ['add', '--', ...clean]);
    if (res.code === 0) {
      this.statusCache.clear();
      return;
    }
    throw new Error((res.stderr || res.stdout).trim() || `git add failed (${res.code})`);
  }
  async commit(cwd: string, message: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const msg = message.trim();
    if (!msg) {
      throw new Error('commit message is required');
    }
    if (msg.includes('\0')) {
      throw new Error('invalid commit message');
    }
    const addRes = await execGit(safeCwd, ['add', '-A']);
    if (addRes.code !== 0) {
      throw new Error((addRes.stderr || addRes.stdout).trim() || `git add failed (${addRes.code})`);
    }
    const res = await execGit(safeCwd, ['commit', '-m', msg]);
    if (res.code === 0) {
      this.statusCache.clear();
      return;
    }
    const err = (res.stderr + res.stdout).trim();
    if (/nothing to commit|no changes added/i.test(err)) {
      throw new Error('nothing to commit');
    }
    throw new Error(err || `git commit failed (${res.code})`);
  }
  async push(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const res = await execGit(safeCwd, ['push']);
    if (res.code === 0) {
      this.statusCache.clear();
      return;
    }
    const err = (res.stderr + res.stdout).trim();
    if (/has no upstream|set-upstream|unknown.*upstream/i.test(err)) {
      const retry = await execGit(safeCwd, ['push', '-u', 'origin', 'HEAD']);
      if (retry.code === 0) {
        this.statusCache.clear();
        return;
      }
      const retryErr = (retry.stderr + retry.stdout).trim();
      throw new Error(retryErr || err || `git push failed (${retry.code})`);
    }
    throw new Error(err || `git push failed (${res.code})`);
  }
  async pull(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const res = await execGit(safeCwd, ['pull', '--rebase']);
    if (res.code === 0) {
      this.statusCache.clear();
      return;
    }
    const err = (res.stderr + res.stdout).trim();
    if (/conflict|needs merge|would be overwritten/i.test(err)) {
      throw new Error(err);
    }
    const retry = await execGit(safeCwd, ['pull']);
    if (retry.code === 0) {
      this.statusCache.clear();
      return;
    }
    const retryErr = (retry.stderr + retry.stdout).trim();
    throw new Error(retryErr || err || `git pull failed (${retry.code})`);
  }
  async init(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const existing = await getStatus(
      safeCwd,
      (c) => this.getAheadBehind(c),
      () => this.getVersion(),
      (c) => this.listBranches(c),
    );
    if (existing.isGit) {
      return;
    }
    const res = await execGit(safeCwd, ['init']);
    if (res.code !== 0) {
      const err = (res.stderr + res.stdout).trim();
      throw new Error(err || `git init failed (${res.code})`);
    }
    this.statusCache.clear();
  }
  async getDiff(cwd: string, filePath: string): Promise<GitDiffResponse> {
    const safeCwd = await this.resolveCwd(cwd);
    return getDiff(safeCwd, filePath);
  }
  async validateBranchName(cwd: string, name: string): Promise<boolean> {
    const safeCwd = await this.resolveCwd(cwd);
    const res = await execGit(safeCwd, ['check-ref-format', '--branch', name]);
    return res.code === 0;
  }
  private async getAheadBehind(cwd: string): Promise<{
    ahead: number;
    behind: number;
  }> {
    const out = await execGitTrim(cwd, [
      'rev-list',
      '--left-right',
      '--count',
      'HEAD...@{u}',
    ]).catch(() => '');
    if (!out) {
      return { ahead: 0, behind: 0 };
    }
    const parts = out.split(/\s+/);
    const ahead = Number(parts[0] ?? 0);
    const behind = Number(parts[1] ?? 0);
    return Number.isNaN(ahead) || Number.isNaN(behind)
      ? { ahead: 0, behind: 0 }
      : { ahead, behind };
  }
  private async getVersion(): Promise<string | null> {
    if (this.gitVersionCache !== undefined) {
      return this.gitVersionCache;
    }
    try {
      const out = await execGitTrim(process.cwd(), ['--version']);
      this.gitVersionCache = out || null;
      return this.gitVersionCache;
    } catch {
      this.gitVersionCache = null;
      return null;
    }
  }
  private async resolveCwd(cwd: string): Promise<string> {
    if (cwd.includes('\0')) {
      throw new Error('invalid cwd');
    }
    return cwd;
  }
}
