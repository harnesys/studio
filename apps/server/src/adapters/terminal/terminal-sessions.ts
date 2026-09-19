import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import type { ProcessJobRecord, ProcessJobRegistry } from 'harnesys';
export type TerminalDataListener = (chunk: string) => void;
export type TerminalExitListener = (code: number | null) => void;
export type TerminalSessionsDeps = {
  jobs: ProcessJobRegistry;
};
function toSessionRecord(job: ProcessJobRecord): TerminalSessionRecord {
  return {
    id: job.id,
    workspaceId: job.workspaceId ?? '',
    title: job.title,
    cwd: job.cwd,
    createdAt: job.createdAt,
    exitCode: job.exitCode,
    exited: job.status !== 'running',
  };
}
export class TerminalSessionRegistry {
  private readonly jobs: ProcessJobRegistry;
  private readonly titleIndexByWorkspace = new Map<string, number>();
  constructor(deps: TerminalSessionsDeps) {
    this.jobs = deps.jobs;
  }
  list(workspaceId: string): TerminalSessionRecord[] {
    return this.jobs.list({ workspaceId, mode: 'pty' }).map(toSessionRecord);
  }
  get(sessionId: string): TerminalSessionRecord | null {
    const job = this.jobs.get(sessionId);
    return job && job.mode === 'pty' ? toSessionRecord(job) : null;
  }
  create(workspaceId: string, cwd: string): TerminalSessionRecord {
    const titleIndex = (this.titleIndexByWorkspace.get(workspaceId) ?? 0) + 1;
    this.titleIndexByWorkspace.set(workspaceId, titleIndex);
    const title = titleIndex === 1 ? 'Terminal' : `Terminal ${titleIndex}`;
    return toSessionRecord(
      this.jobs.start({
        workspaceId,
        cwd,
        mode: 'pty',
        command: process.env.SHELL ?? '/bin/zsh',
        title,
      }),
    );
  }
  write(sessionId: string, data: string): boolean {
    return this.jobs.write(sessionId, data);
  }
  resize(sessionId: string, cols: number, rows: number): boolean {
    return this.jobs.resize(sessionId, cols, rows);
  }
  subscribe(
    sessionId: string,
    onData: TerminalDataListener,
    onExit?: TerminalExitListener,
  ): (() => void) | null {
    return this.jobs.subscribe(sessionId, onData, onExit);
  }
  scrollback(sessionId: string): string | null {
    return this.jobs.read(sessionId)?.text ?? null;
  }
  delete(sessionId: string): boolean {
    return this.jobs.delete(sessionId);
  }
}
const byJobs = new WeakMap<ProcessJobRegistry, TerminalSessionRegistry>();
export function terminalSessionsFor(jobs: ProcessJobRegistry): TerminalSessionRegistry {
  const cached = byJobs.get(jobs);
  if (cached) {
    return cached;
  }
  const created = new TerminalSessionRegistry({ jobs });
  byJobs.set(jobs, created);
  return created;
}
