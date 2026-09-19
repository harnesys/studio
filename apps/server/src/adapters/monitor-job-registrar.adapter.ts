import type { MonitorJobSpec } from 'harnesys';
import type { MonitorJobRegistrar, MonitorJobRegistration } from '../domain/monitor-jobs.port.ts';

export type { MonitorJobRegistration };
export type MonitorJobRegistrarDeps = {
  notify: (threadId: string, text: string, type: string) => void;
  warn?: (message: string) => void;
};
type RunningJob = {
  key: string;
  name: string;
  pid: number;
};
export class MonitorJobRegistrarAdapter implements MonitorJobRegistrar {
  private readonly running = new Map<string, Map<string, RunningJob>>();
  constructor(private readonly deps: MonitorJobRegistrarDeps) {}
  register(input: MonitorJobRegistration): void {
    let jobs = this.running.get(input.threadId);
    if (jobs === undefined) {
      jobs = new Map();
      this.running.set(input.threadId, jobs);
    }
    for (const job of input.jobs) {
      const key = `${job.pluginId}:${job.name}`;
      if (jobs.has(key)) {
        continue;
      }
      if (job.when !== 'always') {
        jobs.set(key, PENDING);
        continue;
      }
      const spawned = this.spawn(key, job, input);
      jobs.set(key, spawned);
    }
  }
  deregister(threadId: string): void {
    const jobs = this.running.get(threadId);
    if (jobs === undefined) {
      return;
    }
    this.running.delete(threadId);
    for (const job of jobs.values()) {
      if (job === PENDING) {
        continue;
      }
      killProcessGroup(job.pid);
    }
  }
  private spawn(key: string, job: MonitorJobSpec, input: MonitorJobRegistration): RunningJob {
    const warn = this.deps.warn ?? (() => {});
    const argv = tokenize(job.command);
    if (argv === undefined) {
      warn(`[monitors] "${job.name}": command is not tokenizable without a shell: ${job.command}`);
      return PENDING;
    }
    let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
    try {
      proc = Bun.spawn(argv, {
        cwd: input.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
        detached: true,
      });
    } catch (error) {
      warn(`[monitors] "${job.name}": spawn failed: ${errorMessage(error)}`);
      return PENDING;
    }
    const running: RunningJob = { key, name: job.name, pid: proc.pid };
    void this.pipeLines(proc, input.threadId, job.name);
    void drain(proc.stderr);
    void proc.exited.then(() => {
      const jobs = this.running.get(input.threadId);
      if (jobs?.get(key) === running) {
        jobs.delete(key);
      }
    });
    return running;
  }
  private async pipeLines(
    proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
    threadId: string,
    name: string,
  ): Promise<void> {
    const body = new Response(proc.stdout).body;
    if (body === null) {
      return;
    }
    let buffer = '';
    const decoder = new TextDecoder();
    try {
      for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          if (line.length > 0) {
            this.deps.notify(threadId, line, `monitor:${name}`);
          }
          newline = buffer.indexOf('\n');
        }
      }
    } catch {}
  }
}
const PENDING: RunningJob = { key: '', name: '', pid: -1 };
function tokenize(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let i = 0;
  const metachars = '|&;<>$`*?[](){}\\';
  while (i < command.length) {
    const ch = command.charAt(i);
    if (ch === "'" || ch === '"') {
      const end = command.indexOf(ch, i + 1);
      if (end === -1) {
        return undefined;
      }
      current += command.slice(i + 1, end);
      started = true;
      i = end + 1;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      i++;
      continue;
    }
    if (metachars.includes(ch)) {
      return undefined;
    }
    current += ch;
    started = true;
    i++;
  }
  if (started) {
    tokens.push(current);
  }
  return tokens.length > 0 ? tokens : undefined;
}
function killProcessGroup(pid: number): void {
  if (pid <= 0) {
    return;
  }
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
async function drain(stream: ReadableStream<Uint8Array> | undefined): Promise<void> {
  if (stream === undefined) {
    return;
  }
  try {
    const reader = stream.getReader();
    while ((await reader.read()).done === false) {}
  } catch {}
}
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}
