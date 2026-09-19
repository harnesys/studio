import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitBranch, GitFileStatusMap, GitStatusResponse } from '@harnesys/studio-shared';
import { GIT_SLOW_THRESHOLD_MS } from '../../config/constants.ts';
import { trace } from '../../libs/trace.ts';
import { execGit, execGitTrim } from './git-exec.ts';
import { parsePorcelain } from './git-helpers.ts';

type StatusCache = {
  map: GitFileStatusMap;
  truncated: boolean;
  mtimeKey: string;
  ts: number;
  slowCount: number;
};
export async function getStatus(
  safeCwd: string,
  getAheadBehind: (cwd: string) => Promise<{
    ahead: number;
    behind: number;
  }>,
  getVersion: () => Promise<string | null>,
  listBranches: (cwd: string) => Promise<{
    local: GitBranch[];
    recent: GitBranch[];
  }>,
): Promise<GitStatusResponse> {
  const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside !== 'true') {
    return { isGit: false, gitVersion: await getVersion().catch(() => null) };
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
      getAheadBehind(safeCwd),
      getVersion().catch(() => null),
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
  if (elapsed > GIT_SLOW_THRESHOLD_MS) {
    trace('git', 'slow getStatus', { cwd: safeCwd, elapsed });
  }
  let branches:
    | {
        local: GitBranch[];
        recent: GitBranch[];
      }
    | undefined;
  try {
    branches = await listBranches(safeCwd);
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
export async function getFileStatus(
  safeCwd: string,
  statusCache: Map<string, StatusCache>,
  getMtimeKey: (cwd: string) => Promise<string>,
  subPath?: string,
): Promise<{
  map: GitFileStatusMap;
  truncated: boolean;
}> {
  const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside !== 'true') {
    return { map: {}, truncated: false };
  }
  const cacheKey = subPath ? `${safeCwd}::${subPath}` : safeCwd;
  const now = Date.now();
  const mtimeKey = await getMtimeKey(safeCwd).catch(() => '');
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
  const prev = statusCache.get(cacheKey);
  const slow = elapsed > GIT_SLOW_THRESHOLD_MS;
  if (slow) {
    const slowCount = (prev?.slowCount ?? 0) + 1;
    if (slowCount >= 2) {
      truncated = true;
      trace('git', 'truncated file-status', { cwd: safeCwd, elapsed, slowCount });
    }
    const map = truncated ? {} : parsePorcelain(raw);
    statusCache.set(cacheKey, { map, truncated, mtimeKey, ts: now, slowCount });
    return { map, truncated };
  }
  const map = parsePorcelain(raw);
  statusCache.set(cacheKey, { map, truncated: false, mtimeKey, ts: now, slowCount: 0 });
  return { map, truncated: false };
}
export async function getMtimeKey(cwd: string): Promise<string> {
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
