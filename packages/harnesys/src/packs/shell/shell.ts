import path from 'node:path';
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_TIMEOUT_MS,
} from '../../adapters/actions/constants.ts';
import type { ToolCallGate, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { firstMatchingCommandPattern } from './command-glob.ts';

export type ShellOptions = {
  timeout?: number;
  /** Globs matched against the full command string; matches skip permission ask. */
  allowlist?: readonly string[];
  /** Globs matched against the full command string; matches hard-deny before permission ask. */
  blocklist?: readonly string[];
};

export function shell(options: ShellOptions = {}): ToolDefinition {
  const defaultTimeout = options.timeout ?? DEFAULT_SHELL_TIMEOUT_MS;
  const allowlist = options.allowlist ?? [];
  const blocklist = options.blocklist ?? [];
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
    gate: (input) => gateShellCommand(input, allowlist, blocklist),
    execute(input, ctx) {
      const parsed = input as { command: string; timeout_ms?: number };
      const timeoutMs = Math.min(
        Math.max(1, parsed.timeout_ms ?? defaultTimeout),
        MAX_SHELL_TIMEOUT_MS,
      );
      return runOnHost(parsed.command, timeoutMs, ctx.cwd, {
        signal: ctx.signal,
        env: ctx.env,
      });
    },
  });
}

function gateShellCommand(
  input: unknown,
  allowlist: readonly string[],
  blocklist: readonly string[],
): ToolCallGate | undefined {
  const command =
    typeof (input as { command?: unknown })?.command === 'string'
      ? (input as { command: string }).command
      : '';
  if (command.length === 0) {
    return undefined;
  }
  const blocked = firstMatchingCommandPattern(command, blocklist);
  if (blocked !== undefined) {
    return {
      decision: 'deny',
      reason: `command blocked by shell blocklist (${blocked}): ${command}`,
    };
  }
  if (allowlist.length > 0) {
    const allowed = firstMatchingCommandPattern(command, allowlist);
    if (allowed !== undefined) {
      return { decision: 'allow' };
    }
  }
  return undefined;
}

async function runOnHost(
  command: string,
  timeoutMs: number,
  cwd: string,
  opts: { signal?: AbortSignal; env?: Record<string, string> },
) {
  const { signal, env } = opts;
  const started = performance.now();
  const proc = Bun.spawn(['/bin/sh', '-c', command], {
    cwd: path.resolve(cwd),
    env,
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
