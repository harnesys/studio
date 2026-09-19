import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitDiffResponse, GitFileStatus } from '@harnesys/studio-shared';
import { execGit, execGitTrim } from './git-exec.ts';
import { parsePorcelain } from './git-helpers.ts';
export async function getDiff(safeCwd: string, filePath: string): Promise<GitDiffResponse> {
  const cleanPath = filePath.trim().replace(/^\/+/, '');
  if (!cleanPath || cleanPath.includes('\0') || cleanPath.includes('\n')) {
    throw new Error('invalid path');
  }
  const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside !== 'true') {
    throw new Error('not a git repository');
  }
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
  if (!map[cleanPath]) {
    const abs = join(safeCwd, cleanPath);
    const exists = await stat(abs)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
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
  let original: string | null = null;
  let isBinary = false;
  try {
    const res = await execGit(safeCwd, ['show', `HEAD:${cleanPath}`]);
    if (res.code === 0) {
      const buf = Buffer.from(res.stdout, 'utf8');
      if (buf.includes(0)) {
        isBinary = true;
      } else if (res.stdout.length > 500000) {
        original = `${res.stdout.slice(0, 500000)}\n… truncated`;
      } else {
        original = res.stdout;
      }
    }
  } catch {}
  let current: string | null = null;
  const absPath = join(safeCwd, cleanPath);
  try {
    const st = await stat(absPath);
    if (st.isFile()) {
      if (st.size > 1000000) {
        isBinary = false;
        const buf = await readFile(absPath);
        const text = buf.toString('utf8');
        current = `${text.slice(0, 500000)}\n… truncated`;
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
  if (status === 'deleted') {
    current = null;
  }
  if (status === 'untracked' || status === 'added') {
    if (original !== null && status === 'untracked') {
      original = null;
    }
  }
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
      const res2 = await execGit(safeCwd, ['diff', '--no-color', '-U3', '--', cleanPath]);
      if (res2.code === 0 && res2.stdout.trim()) {
        diff = res2.stdout;
      }
    }
    if (!diff && (status === 'untracked' || status === 'added') && current !== null) {
      diff = `--- /dev/null\n+++ b/${cleanPath}\n${current
        .split('\n')
        .map((l) => `+${l}`)
        .join('\n')}`;
    }
  } catch {}
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
