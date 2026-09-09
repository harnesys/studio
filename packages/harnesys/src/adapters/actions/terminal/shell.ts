import path from 'node:path';
import type { ToolDefinition } from '../../../ports/tools.ts';
import { tool } from '../../../ports/tools.ts';
import { DEFAULT_SHELL_TIMEOUT_MS, MAX_SHELL_TIMEOUT_MS } from '../constants.ts';

export type ShellOptions = { timeout?: number };

export function shell(options: ShellOptions = {}): ToolDefinition {
  const defaultTimeout = options.timeout ?? DEFAULT_SHELL_TIMEOUT_MS;
  return tool('shell', {
    group: 'core',
    description: 'Run a shell command with cwd fixed to the thread workdir.',
    operations: ['process'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_ms: { type: 'integer', minimum: 1 },
      },
      required: ['command'],
    },
    execute(input, ctx) {
      const parsed = input as { command: string; timeout_ms?: number };
      const timeoutMs = Math.min(
        Math.max(1, parsed.timeout_ms ?? defaultTimeout),
        MAX_SHELL_TIMEOUT_MS,
      );
      return runOnHost(parsed.command, timeoutMs, ctx.cwd, ctx.signal);
    },
  });
}

async function runOnHost(command: string, timeoutMs: number, cwd: string, signal?: AbortSignal) {
  const started = performance.now();
  const proc = Bun.spawn(['/bin/sh', '-c', command], {
    cwd: path.resolve(cwd),
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    detached: true,
  });
  let timedOut = false;
  const stop = (): void => {
    killProcessGroup(proc.pid);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  const onAbort = (): void => {
    stop();
  };
  if (signal?.aborted) {
    stop();
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (signal?.aborted) {
      throw new Error('shell aborted');
    }
    if (timedOut) {
      throw new Error(`shell timed out after ${timeoutMs}ms`);
    }
    return {
      exitCode,
      stdout: stdoutBuf,
      stderr: stderrBuf,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return;
    }
  }
}
