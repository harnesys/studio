import path from 'node:path';
import type {
  ProcessJobReadResult,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
} from '../../domain/process-job.ts';

const SCROLLBACK_CHARS = 256_000;
const MAX_RUNNING_PER_CWD = 16;

type DataListener = (chunk: string) => void;
type ExitListener = (code: number | null) => void;

type LiveJob = {
  record: ProcessJobRecord;
  proc: Bun.Subprocess;
  terminal: Bun.Terminal | null;
  scrollback: string;
  totalAppended: number;
  settled: boolean;
  dataListeners: Set<DataListener>;
  exitListeners: Set<ExitListener>;
};

function appendScrollback(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= SCROLLBACK_CHARS) {
    return next;
  }
  return next.slice(next.length - SCROLLBACK_CHARS);
}

function defaultShell(): string {
  const fromEnv = process.env.SHELL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
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

function pushChunk(job: LiveJob, chunk: string): void {
  if (chunk.length === 0) {
    return;
  }
  job.scrollback = appendScrollback(job.scrollback, chunk);
  job.totalAppended += chunk.length;
  for (const listener of job.dataListeners) {
    listener(chunk);
  }
}

function settle(job: LiveJob, status: ProcessJobStatus, code: number | null): void {
  if (job.settled) {
    return;
  }
  job.settled = true;
  job.record = { ...job.record, status, exitCode: code };
  for (const listener of job.exitListeners) {
    listener(code);
  }
}

function pumpStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onChunk: (text: string) => void,
): void {
  if (!stream) {
    return;
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          onChunk(decoder.decode(value, { stream: true }));
        }
      }
      const rest = decoder.decode();
      if (rest) {
        onChunk(rest);
      }
    } catch {
      return;
    } finally {
      reader.releaseLock();
    }
  })();
}

function decodeTerminalData(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    return data;
  }
  return new TextDecoder().decode(data);
}

/**
 * In-memory process jobs (pipes + pty) backed by Bun.spawn.
 * One registry per host process; jobs die with the server.
 */
export function createProcessJobRegistry(): ProcessJobRegistry {
  const byId = new Map<string, LiveJob>();

  function runningInCwd(cwd: string): number {
    let count = 0;
    for (const job of byId.values()) {
      if (job.record.cwd === cwd && job.record.status === 'running') {
        count += 1;
      }
    }
    return count;
  }

  function snapshot(record: ProcessJobRecord): ProcessJobRecord {
    return { ...record };
  }

  return {
    start(input): ProcessJobRecord {
      const cwd = path.resolve(input.cwd);
      if (runningInCwd(cwd) >= MAX_RUNNING_PER_CWD) {
        throw new Error('too many running process jobs');
      }
      const id = crypto.randomUUID();
      const record: ProcessJobRecord = {
        id,
        cwd,
        mode: input.mode,
        title: input.title ?? (input.command || 'Terminal'),
        command: input.command,
        status: 'running',
        exitCode: null,
        createdAt: new Date().toISOString(),
        ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
      };

      let job: LiveJob | undefined;
      if (input.mode === 'pty') {
        const shell = defaultShell();
        let argv: string[];
        if (process.platform === 'win32') {
          argv = [shell];
        } else if (input.command) {
          argv = [shell, '-l', '-c', input.command];
        } else {
          argv = [shell, '-l'];
        }
        const proc = Bun.spawn(argv, {
          cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            ...input.env,
          },
          terminal: {
            cols: input.cols ?? 80,
            rows: input.rows ?? 24,
            name: 'xterm-256color',
            data: (_terminal, data) => {
              if (!job) {
                return;
              }
              pushChunk(job, decodeTerminalData(data));
            },
          },
          onExit: (_subprocess, exitCode) => {
            if (!job) {
              return;
            }
            settle(job, 'exited', typeof exitCode === 'number' ? exitCode : null);
          },
        });
        if (!proc.terminal) {
          try {
            proc.kill();
          } catch {
            return record;
          }
          throw new Error('Bun.spawn did not attach a terminal');
        }
        job = {
          record,
          proc,
          terminal: proc.terminal,
          scrollback: '',
          totalAppended: 0,
          settled: false,
          dataListeners: new Set(),
          exitListeners: new Set(),
        };
      } else {
        const proc = Bun.spawn(['/bin/sh', '-c', input.command], {
          cwd,
          env: input.env,
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: 'pipe',
          detached: true,
        });
        job = {
          record,
          proc,
          terminal: null,
          scrollback: '',
          totalAppended: 0,
          settled: false,
          dataListeners: new Set(),
          exitListeners: new Set(),
        };
        const live = job;
        pumpStream(proc.stdout, (chunk) => pushChunk(live, chunk));
        pumpStream(proc.stderr, (chunk) => pushChunk(live, chunk));
        void proc.exited.then((code) => {
          settle(live, 'exited', typeof code === 'number' ? code : null);
        });
      }
      byId.set(id, job);
      return snapshot(job.record);
    },

    get(id): ProcessJobRecord | null {
      const job = byId.get(id);
      return job ? snapshot(job.record) : null;
    },

    list(filter): ProcessJobRecord[] {
      return [...byId.values()]
        .filter((job) => {
          if (filter?.cwd !== undefined && job.record.cwd !== path.resolve(filter.cwd)) {
            return false;
          }
          if (filter?.workspaceId !== undefined && job.record.workspaceId !== filter.workspaceId) {
            return false;
          }
          if (filter?.mode !== undefined && job.record.mode !== filter.mode) {
            return false;
          }
          return true;
        })
        .map((job) => snapshot(job.record))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    read(id, opts): ProcessJobReadResult | null {
      const job = byId.get(id);
      if (!job) {
        return null;
      }
      const since = opts?.since ?? 0;
      const dropped = job.totalAppended - job.scrollback.length;
      if (since <= dropped) {
        return { text: job.scrollback, nextSince: job.totalAppended, truncated: since < dropped };
      }
      return {
        text: job.scrollback.slice(since - dropped),
        nextSince: job.totalAppended,
        truncated: false,
      };
    },

    write(id, data): boolean {
      const job = byId.get(id);
      if (job?.record.status !== 'running') {
        return false;
      }
      try {
        if (job.terminal) {
          if (job.terminal.closed) {
            return false;
          }
          job.terminal.write(data);
          return true;
        }
        const stdin = job.proc.stdin;
        if (stdin === null || stdin === undefined || typeof stdin === 'number') {
          return false;
        }
        stdin.write(data);
        return true;
      } catch {
        return false;
      }
    },

    resize(id, cols, rows): boolean {
      const job = byId.get(id);
      if (job?.record.status !== 'running' || !job.terminal) {
        return false;
      }
      if (
        !Number.isFinite(cols) ||
        !Number.isFinite(rows) ||
        cols < 2 ||
        rows < 1 ||
        job.terminal.closed
      ) {
        return false;
      }
      job.terminal.resize(Math.floor(cols), Math.floor(rows));
      return true;
    },

    subscribe(id, onData, onExit): (() => void) | null {
      const job = byId.get(id);
      if (!job) {
        return null;
      }
      job.dataListeners.add(onData);
      if (onExit) {
        job.exitListeners.add(onExit);
      }
      return () => {
        job.dataListeners.delete(onData);
        if (onExit) {
          job.exitListeners.delete(onExit);
        }
      };
    },

    kill(id): boolean {
      const job = byId.get(id);
      if (job?.record.status !== 'running') {
        return false;
      }
      try {
        if (job.terminal) {
          if (!job.proc.killed) {
            job.proc.kill();
          }
          if (!job.terminal.closed) {
            job.terminal.close();
          }
        } else {
          killProcessGroup(job.proc.pid);
        }
      } catch {
        return false;
      }
      settle(job, 'killed', null);
      return true;
    },

    delete(id): boolean {
      const job = byId.get(id);
      if (!job) {
        return false;
      }
      byId.delete(id);
      try {
        if (job.terminal) {
          if (!job.proc.killed) {
            job.proc.kill();
          }
          if (!job.terminal.closed) {
            job.terminal.close();
          }
        } else if (job.record.status === 'running') {
          killProcessGroup(job.proc.pid);
        }
      } catch {
        // already dead
      }
      job.dataListeners.clear();
      job.exitListeners.clear();
      return true;
    },
  };
}
