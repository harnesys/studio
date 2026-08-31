import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitDiffResponse, GitFileStatus } from '../../../shared/types.ts';
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
