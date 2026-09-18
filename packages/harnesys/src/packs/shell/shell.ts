import path from 'node:path';
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_TIMEOUT_MS,
} from '../../adapters/actions/constants.ts';
import type {
  ProcessJobMode,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
} from '../../domain/process-job.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { gateShellCommand } from './shell-gate.ts';

export type ShellOptions = {
  timeout?: number;
  /** Globs matched against the full command string; matches skip permission ask. */
  allowlist?: readonly string[];
  /** Globs matched against the full command string; matches hard-deny before permission ask. */
  blocklist?: readonly string[];
};

export type ShellExecuteInput = {
  command: string;
  timeout_ms?: number;
  run_in_background?: boolean;
  block_until_ms?: number;
  open_in_terminal?: boolean;
};

export type ShellBlockingResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type ShellBackgroundResult = {
  jobId: string;
  mode: ProcessJobMode;
  status: ProcessJobStatus;
  title: string;
};

export type ShellStartErrorResult = {
  jobId: '';
  error: string;
};

export type ShellWaitedResult = ShellBlockingResult & {
  jobId: string;
  mode: ProcessJobMode;
  status: ProcessJobStatus;
};

export type ShellWaitTimeoutResult = {
  jobId: string;
  mode: ProcessJobMode;
  status: 'running';
  outputSoFar: string;
  timedOutWaiting: true;
};

export type ShellBlockingArgs = {
  command: string;
  timeoutMs: number;
  ctx: ToolContext;
  ports: ShellPorts;
  mode: ProcessJobMode;
};

export type ShellBackgroundArgs = {
  input: ShellExecuteInput;
  ctx: ToolContext;
  ports: ShellPorts;
  mode: ProcessJobMode;
};

export type ShellPorts = {
  jobs?: ProcessJobRegistry;
  /** Host hook fired after a `pty` job starts (Studio publishes a desk event). */
  onPtyJob?: (record: ProcessJobRecord) => void;
  /** Host hook resolving the current workspace (Studio reads the run scope). */
  resolveWorkspaceId?: () => string | undefined;
};
export function shell(options: ShellOptions = {}, ports: ShellPorts = {}): ToolDefinition {
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
        run_in_background: { type: 'boolean' },
        block_until_ms: { type: 'integer', minimum: 0 },
        open_in_terminal: { type: 'boolean' },
      },
      required: ['command'],
    },
    gate: (input) => gateShellCommand(input, allowlist, blocklist),
    execute(input, ctx) {
      const parsed = input as ShellExecuteInput;
      const timeoutMs = Math.min(
        Math.max(1, parsed.timeout_ms ?? defaultTimeout),
        MAX_SHELL_TIMEOUT_MS,
      );
      const mode: ProcessJobMode = parsed.open_in_terminal === true ? 'pty' : 'pipes';
      const background = parsed.run_in_background === true || parsed.block_until_ms === 0;
      if (!background && parsed.block_until_ms === undefined) {
        return runBlocking({ command: parsed.command, timeoutMs, ctx, ports, mode });
      }
      return runBackground({ input: parsed, ctx, ports, mode });
    },
  });
}

function requireJobs(jobs: ProcessJobRegistry | undefined): ProcessJobRegistry {
  if (!jobs) {
    throw new Error('shell background jobs unavailable: ProcessJobRegistry not wired');
  }
  return jobs;
}

function waitForJobExit(
  jobs: ProcessJobRegistry,
  id: string,
  waitMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsub?.();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      finish();
    };
    const timer = setTimeout(finish, Math.max(0, waitMs));
    unsub = jobs.subscribe(
      id,
      () => undefined,
      () => {
        finish();
      },
    );
    if (unsub === null) {
      finish();
      return;
    }
    if (signal?.aborted === true) {
      finish();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function runBlocking(args: ShellBlockingArgs): Promise<ShellBlockingResult> {
  const { command, timeoutMs, ctx, ports, mode } = args;
  if (mode === 'pipes') {
    return runOnHost(command, timeoutMs, ctx.cwd, {
      signal: ctx.signal,
      env: ctx.env,
    });
  }
  const registry = requireJobs(ports.jobs);
  const started = performance.now();
  const workspaceId = ports.resolveWorkspaceId?.();
  const record = registry.start({ cwd: ctx.cwd, command, mode, env: ctx.env, workspaceId });
  ports.onPtyJob?.(record);
  await waitForJobExit(registry, record.id, timeoutMs, ctx.signal);
  if (ctx.signal?.aborted === true) {
    registry.kill(record.id);
    throw new Error('shell aborted');
  }
  const final = registry.get(record.id);
  if (!final || final.status === 'running') {
    registry.kill(record.id);
    throw new Error(`shell timed out after ${timeoutMs}ms`);
  }
  return {
    exitCode: final.exitCode,
    stdout: registry.read(record.id)?.text ?? '',
    stderr: '',
    durationMs: Math.round(performance.now() - started),
  };
}

async function runBackground(
  args: ShellBackgroundArgs,
): Promise<
  ShellBackgroundResult | ShellStartErrorResult | ShellWaitedResult | ShellWaitTimeoutResult
> {
  const { input: parsed, ctx, ports, mode } = args;
  const registry = requireJobs(ports.jobs);
  const started = performance.now();
  const workspaceId = ports.resolveWorkspaceId?.();
  let record: ProcessJobRecord;
  try {
    record = registry.start({
      cwd: ctx.cwd,
      command: parsed.command,
      mode,
      env: ctx.env,
      workspaceId,
    });
  } catch (err) {
    return {
      jobId: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (mode === 'pty') {
    ports.onPtyJob?.(record);
  }
  const waitMs = parsed.block_until_ms ?? 0;
  if (!(waitMs > 0)) {
    return { jobId: record.id, mode: record.mode, status: record.status, title: record.title };
  }
  await waitForJobExit(registry, record.id, waitMs, ctx.signal);
  const final = registry.get(record.id);
  const text = registry.read(record.id)?.text ?? '';
  const durationMs = Math.round(performance.now() - started);
  if (final && final.status !== 'running') {
    return {
      jobId: record.id,
      mode: final.mode,
      status: final.status,
      exitCode: final.exitCode,
      stdout: text,
      stderr: '',
      durationMs,
    };
  }
  return {
    jobId: record.id,
    mode: record.mode,
    status: 'running',
    outputSoFar: text,
    timedOutWaiting: true,
  };
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
