import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GitNotFoundError, GitTimeoutError } from '../domain/git.error.ts';
import { ConflictError, ValidationError } from '../domain/studio.error.ts';

const PLUGIN_GIT_TIMEOUT_MS = 120_000;
const GITHUB_SHORTHAND_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type ClonePluginRequest = {
  source: string;
  dest: string;
};

export type PluginRevision = {
  revision: string;
};

export type UpdatePluginCheckoutRequest = {
  path: string;
  ref?: string;
};

type SpawnGitResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type SpawnGitRequest = {
  cwd: string;
  args: string[];
  timeoutMs?: number;
};

/** `owner/repo` (optional `.git`) → `https://github.com/owner/repo.git`. URLs pass through. */
export function resolveGitSource(source: string): string {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('source is required');
  }
  if (GITHUB_SHORTHAND_RE.test(trimmed)) {
    const withoutGit = trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed;
    return `https://github.com/${withoutGit}.git`;
  }
  return trimmed;
}

export async function clonePlugin(request: ClonePluginRequest): Promise<PluginRevision> {
  const dest = request.dest;
  if (existsSync(dest)) {
    throw new ConflictError(`plugin path exists: ${dest}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await runGit(dirname(dest), ['clone', '--', request.source, dest]);
  const revision = await runGit(dest, ['rev-parse', 'HEAD']);
  return { revision };
}

export async function updatePluginCheckout(
  request: UpdatePluginCheckoutRequest,
): Promise<PluginRevision> {
  const cwd = request.path;
  if (request.ref !== undefined) {
    assertGitRef(request.ref);
    await runGit(cwd, ['fetch', '--tags', 'origin', request.ref]);
    await runGit(cwd, ['checkout', '--force', request.ref]);
  } else {
    await runGit(cwd, ['fetch', '--tags', 'origin']);
    const pull = await spawnGit({ cwd, args: ['pull', '--ff-only'] });
    if (pull.code !== 0) {
      await runGit(cwd, ['merge', '--ff-only', 'FETCH_HEAD']);
    }
  }
  const revision = await runGit(cwd, ['rev-parse', 'HEAD']);
  return { revision };
}

export async function removePluginPath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

function assertGitRef(ref: string): void {
  if (ref.length === 0 || ref.startsWith('-') || ref.includes('\0') || ref.includes('\n')) {
    throw new ValidationError('invalid ref');
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const res = await spawnGit({ cwd, args });
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim();
    if (/not found|No such file|ENOENT/i.test(detail)) {
      throw new GitNotFoundError(detail || 'git not found');
    }
    throw new Error(detail || `git ${args[0] ?? ''} failed (${res.code})`);
  }
  return res.stdout.trim();
}

async function spawnGit(request: SpawnGitRequest): Promise<SpawnGitResult> {
  const timeoutMs = request.timeoutMs ?? PLUGIN_GIT_TIMEOUT_MS;
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    proc = Bun.spawn(['git', ...request.args], {
      cwd: request.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    const msg = String(err);
    if (/ENOENT|not found/i.test(msg)) {
      throw new GitNotFoundError('git not found');
    }
    throw err;
  }

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc?.kill();
    } catch {
      // ignore
    }
  }, timeoutMs);

  try {
    const stdoutStream =
      proc.stdout != null && typeof proc.stdout !== 'number'
        ? (proc.stdout as ReadableStream)
        : null;
    const stderrStream =
      proc.stderr != null && typeof proc.stderr !== 'number'
        ? (proc.stderr as ReadableStream)
        : null;
    const [stdout, stderr, code] = await Promise.all([
      stdoutStream ? new Response(stdoutStream).text() : '',
      stderrStream ? new Response(stderrStream).text() : '',
      proc.exited,
    ]);
    if (timedOut) {
      throw new GitTimeoutError('git timeout');
    }
    return { code, stdout, stderr };
  } catch (err) {
    if (err instanceof GitTimeoutError) {
      throw err;
    }
    const msg = String(err);
    if (/kill|timeout/i.test(msg)) {
      throw new GitTimeoutError('git timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
