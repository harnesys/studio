import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GitBranch,
  GitDiffResponse,
  GitFileStatus,
  GitFileStatusMap,
  GitStatusResponse,
} from '../../../shared/types.ts';
import {
  GitBranchExistsError,
  GitBranchInvalidError,
  GitDirtyError,
} from '../../domain/git.error.ts';
import type { GitPort } from '../../domain/git.port.ts';
import { trace } from '../../trace.ts';
import { execGit, execGitTrim } from './git-exec.ts';
import { parsePorcelain } from './git-helpers.ts';

const SLOW_THRESHOLD_MS = 800;

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
    const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(
      () => '',
    );
    if (inside !== 'true') {
      return { isGit: false, gitVersion: await this.getVersion().catch(() => null) };
    }
    const start = Date.now();
    const [branchRaw, head, porcelain, aheadBehind, version, userName, userEmail, remote] =
      await Promise.all([
        execGitTrim(safeCwd, ['symbolic-ref', '--short', 'HEAD']).catch(() => ''),
        execGitTrim(safeCwd, ['rev-parse', '--short', 'HEAD']).catch(() => ''),
        execGit(safeCwd, [
          'status',
          '--porcelain=v1',
          '-z',
          '--no-renames',
          '--untracked-files=all',
          '--ignored',
        ])
          .then((r) => (r.code === 0 ? r.stdout : ''))
          .catch(() => ''),
        this.getAheadBehind(safeCwd),
        this.getVersion().catch(() => null),
        execGitTrim(safeCwd, ['config', '--get', 'user.name']).catch(() => ''),
        execGitTrim(safeCwd, ['config', '--get', 'user.email']).catch(() => ''),
        execGitTrim(safeCwd, ['config', '--get', 'remote.origin.url']).catch(() => ''),
      ]);

    let branch: string | null = branchRaw || null;
    let detached = false;
    let headShort: string | null = head || null;
    let noCommits = false;
    if (!branch) {
      const verify = await execGitTrim(safeCwd, ['rev-parse', '--verify', 'HEAD']).catch(() => '');
      if (!verify) {
        const headRef = await execGitTrim(safeCwd, ['symbolic-ref', 'HEAD']).catch(() => '');
        branch = headRef.startsWith('refs/heads/') ? headRef.replace('refs/heads/', '') : null;
        noCommits = true;
        headShort = null;
      } else {
        detached = true;
        branch = null;
      }
    }
    const mapForCounts = parsePorcelain(porcelain);
    const counts = {
      added: 0,
      modified: 0,
      deleted: 0,
      untracked: 0,
      staged: 0,
      conflicted: 0,
      renamed: 0,
    };
    for (const v of Object.values(mapForCounts)) {
      if (v === 'ignored') {
        continue;
      }
      if (v === 'added') {
        counts.added++;
      } else if (v === 'modified') {
        counts.modified++;
      } else if (v === 'deleted') {
        counts.deleted++;
      } else if (v === 'untracked') {
        counts.untracked++;
      } else if (v === 'staged') {
        counts.staged++;
      } else if (v === 'conflicted') {
        counts.conflicted++;
      } else if (v === 'renamed') {
        counts.renamed++;
      }
    }
    const dirtyCount = Object.values(counts).reduce((a, b) => a + b, 0);
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_THRESHOLD_MS) {
      trace('git', 'slow getStatus', { cwd: safeCwd, elapsed });
    }
    let branches: { local: GitBranch[]; recent: GitBranch[] } | undefined;
    try {
      branches = await this.listBranches(safeCwd);
    } catch {
      branches = { local: [], recent: [] };
    }
    return {
      isGit: true,
      branch,
      detached,
      head: headShort,
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      dirty: dirtyCount > 0,
      dirtyCount,
      counts: dirtyCount > 0 ? counts : undefined,
      noCommits,
      gitVersion: version,
      gitUser: userName || userEmail ? { name: userName || null, email: userEmail || null } : null,
      remote: remote || null,
      branches,
    };
  }

  async getFileStatus(
    cwd: string,
    subPath?: string,
  ): Promise<{ map: GitFileStatusMap; truncated: boolean }> {
    const safeCwd = await this.resolveCwd(cwd);
    const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(
      () => '',
    );
    if (inside !== 'true') {
      return { map: {}, truncated: false };
    }
    const cacheKey = subPath ? `${safeCwd}::${subPath}` : safeCwd;
    const now = Date.now();
    const mtimeKey = await this.getMtimeKey(safeCwd).catch(() => '');
    const start = Date.now();
    const args = [
      'status',
      '--porcelain=v1',
      '-z',
      '--no-renames',
      '--untracked-files=all',
      '--ignored',
    ];
    if (subPath) {
      args.push('--', subPath);
    }
    const raw = await execGit(safeCwd, args)
      .then((r) => (r.code === 0 ? r.stdout : ''))
      .catch(() => '');
    const elapsed = Date.now() - start;
    let truncated = false;
    const prev = this.statusCache.get(cacheKey);
    const slow = elapsed > SLOW_THRESHOLD_MS;
    if (slow) {
      const slowCount = (prev?.slowCount ?? 0) + 1;
      if (slowCount >= 2) {
        truncated = true;
        trace('git', 'truncated file-status', { cwd: safeCwd, elapsed, slowCount });
      }
      const map = truncated ? {} : parsePorcelain(raw);
      this.statusCache.set(cacheKey, { map, truncated, mtimeKey, ts: now, slowCount });
      return { map, truncated };
    }
    const map = parsePorcelain(raw);
    this.statusCache.set(cacheKey, { map, truncated: false, mtimeKey, ts: now, slowCount: 0 });
    return { map, truncated: false };
  }

  async listBranches(cwd: string): Promise<{ local: GitBranch[]; recent: GitBranch[] }> {
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
    // unborn branch (no commits yet) has no refs/heads entry but HEAD points to it
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
    // validate no absolute/path traversal tricks: git itself will reject outside repo
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
    // stage all changes (including untracked)
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
    // no upstream -> try set upstream to origin HEAD
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
    // rebase may fail on conflict, fallback to plain pull for better message
    if (/conflict|needs merge|would be overwritten/i.test(err)) {
      throw new Error(err);
    }
    // try plain pull if rebase not supported
    const retry = await execGit(safeCwd, ['pull']);
    if (retry.code === 0) {
      this.statusCache.clear();
      return;
    }
    const retryErr = (retry.stderr + retry.stdout).trim();
    throw new Error(retryErr || err || `git pull failed (${retry.code})`);
  }

  async getDiff(cwd: string, filePath: string): Promise<GitDiffResponse> {
    const safeCwd = await this.resolveCwd(cwd);
    const cleanPath = filePath.trim().replace(/^\/+/, '');
    if (!cleanPath || cleanPath.includes('\0') || cleanPath.includes('\n')) {
      throw new Error('invalid path');
    }
    const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(
      () => '',
    );
    if (inside !== 'true') {
      throw new Error('not a git repository');
    }

    // status for this path
    const rawStatus = await execGit(safeCwd, [
      'status',
      '--porcelain=v1',
      '-z',
      '--no-renames',
      '--untracked-files=all',
      '--ignored',
      '--',
      cleanPath,
    ])
      .then((r) => (r.code === 0 ? r.stdout : ''))
      .catch(() => '');
    const map = parsePorcelain(rawStatus);
    let status: GitFileStatus = (map[cleanPath] as GitFileStatus | undefined) ?? 'modified';
    // fallback: if not in map, infer from existence
    if (!map[cleanPath]) {
      const abs = join(safeCwd, cleanPath);
      const exists = await stat(abs)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        // check if tracked in HEAD
        const ls = await execGit(safeCwd, ['ls-files', '--error-unmatch', cleanPath]);
        if (ls.code === 0) {
          status = 'deleted';
        } else {
          status = 'modified';
        }
      } else {
        const ls = await execGit(safeCwd, ['ls-files', '--error-unmatch', cleanPath]);
        status = ls.code === 0 ? 'modified' : 'untracked';
      }
    }

    // original from HEAD
    let original: string | null = null;
    let isBinary = false;
    try {
      const res = await execGit(safeCwd, ['show', `HEAD:${cleanPath}`]);
      if (res.code === 0) {
        const buf = Buffer.from(res.stdout, 'utf8');
        if (buf.includes(0)) {
          isBinary = true;
        } else if (res.stdout.length > 500_000) {
          original = `${res.stdout.slice(0, 500_000)}\n… truncated`;
        } else {
          original = res.stdout;
        }
      }
    } catch {
      // no HEAD or file not in HEAD
    }

    // current from filesystem
    let current: string | null = null;
    const absPath = join(safeCwd, cleanPath);
    try {
      const st = await stat(absPath);
      if (st.isFile()) {
        if (st.size > 1_000_000) {
          isBinary = false;
          const buf = await readFile(absPath);
          const text = buf.toString('utf8');
          current = `${text.slice(0, 500_000)}\n… truncated`;
        } else {
          const buf = await readFile(absPath);
          if (buf.includes(0)) {
            isBinary = true;
          } else {
            current = buf.toString('utf8');
          }
        }
      } else if (st.isDirectory()) {
        isBinary = true;
      }
    } catch {
      current = null;
    }

    // if deleted, current stays null; if added, original stays null
    if (status === 'deleted') {
      current = null;
    }
    if (status === 'untracked' || status === 'added') {
      // original already null when not in HEAD
      if (original !== null && status === 'untracked') {
        // keep original as is; untracked should have no original
        original = null;
      }
    }

    // unified diff for raw view
    let diff: string | null = null;
    try {
      const res = await execGit(safeCwd, [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '-U3',
        'HEAD',
        '--',
        cleanPath,
      ]);
      if (res.code === 0 && res.stdout.trim()) {
        diff = res.stdout;
      } else {
        // try staged vs HEAD + unstaged fallback
        const res2 = await execGit(safeCwd, ['diff', '--no-color', '-U3', '--', cleanPath]);
        if (res2.code === 0 && res2.stdout.trim()) {
          diff = res2.stdout;
        }
      }
      // for untracked/added where HEAD diff empty, synthesize via show current
      if (!diff && (status === 'untracked' || status === 'added') && current !== null) {
        diff = `--- /dev/null\n+++ b/${cleanPath}\n${current
          .split('\n')
          .map((l) => `+${l}`)
          .join('\n')}`;
      }
    } catch {
      // ignore diff errors
    }

    return {
      path: cleanPath,
      status,
      original,
      current,
      diff,
      isBinary,
      truncated: (original?.includes('… truncated') || current?.includes('… truncated')) ?? false,
    };
  }

  async validateBranchName(cwd: string, name: string): Promise<boolean> {
    const safeCwd = await this.resolveCwd(cwd);
    const res = await execGit(safeCwd, ['check-ref-format', '--branch', name]);
    return res.code === 0;
  }

  private async getAheadBehind(cwd: string): Promise<{ ahead: number; behind: number }> {
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

  private async getMtimeKey(cwd: string): Promise<string> {
    const gitDir = await execGitTrim(cwd, ['rev-parse', '--git-dir']).catch(() => '.git');
    const absGitDir = gitDir.startsWith('/') ? gitDir : join(cwd, gitDir);
    const idx = join(absGitDir, 'index');
    const head = join(absGitDir, 'HEAD');
    const [a, b] = await Promise.all([
      stat(idx)
        .then((s) => String(s.mtimeMs))
        .catch(() => '0'),
      stat(head)
        .then((s) => String(s.mtimeMs))
        .catch(() => '0'),
    ]);
    return `${a}:${b}`;
  }

  // biome-ignore lint/suspicious/useAwait: kept async for future async realpath
  private async resolveCwd(cwd: string): Promise<string> {
    if (cwd.includes('\0')) {
      throw new Error('invalid cwd');
    }
    return cwd;
  }
}
