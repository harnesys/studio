import type { ProcessJobRegistry, ProcessJobStatus } from '../../domain/process-job.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

const POLL_WAIT_MAX_MS = 30_000;

export type ProcessPollInput = {
  job_id: string;
  since?: number;
  wait_ms?: number;
};

export type ProcessKillInput = {
  job_id: string;
};

export type ProcessPollResult = {
  jobId: string;
  status: ProcessJobStatus | 'missing';
  exitCode: number | null;
  output: string;
  since: number;
  nextSince: number;
  truncated: boolean;
  error?: string;
};

export type ProcessKillResult = {
  jobId: string;
  status: ProcessJobStatus | 'missing';
  ok: boolean;
};

function waitForJobData(jobs: ProcessJobRegistry, id: string, waitMs: number): Promise<void> {
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
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, waitMs));
    unsub = jobs.subscribe(
      id,
      () => {
        finish();
      },
      () => {
        finish();
      },
    );
    if (unsub === null) {
      finish();
    }
  });
}

export function processTools(jobs: ProcessJobRegistry): ToolDefinition[] {
  return [
    tool('process_poll', {
      group: 'core',
      description: 'Read output and status of a process job.',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          job_id: { type: 'string' },
          since: { type: 'integer', minimum: 0 },
          wait_ms: { type: 'integer', minimum: 0, maximum: POLL_WAIT_MAX_MS },
        },
        required: ['job_id'],
      },
      execute: async (input) => {
        const parsed = input as ProcessPollInput;
        const id = parsed.job_id;
        const since = Math.max(0, parsed.since ?? 0);
        const record = jobs.get(id);
        const read = jobs.read(id, { since });
        if (!record || !read) {
          const missing: ProcessPollResult = {
            jobId: id,
            status: 'missing',
            exitCode: null,
            output: '',
            since,
            nextSince: since,
            truncated: false,
            error: `unknown process job: ${id}`,
          };
          return missing;
        }
        const waitMs = Math.min(Math.max(0, parsed.wait_ms ?? 0), POLL_WAIT_MAX_MS);
        let text = read.text;
        let nextSince = read.nextSince;
        let truncated = read.truncated;
        if (record.status === 'running' && text.length === 0 && waitMs > 0) {
          await waitForJobData(jobs, id, waitMs);
          const reread = jobs.read(id, { since });
          if (reread) {
            text = reread.text;
            nextSince = reread.nextSince;
            truncated = reread.truncated;
          }
        }
        const current = jobs.get(id);
        const result: ProcessPollResult = {
          jobId: id,
          status: current?.status ?? record.status,
          exitCode: current?.exitCode ?? null,
          output: text,
          since,
          nextSince,
          truncated,
        };
        return result;
      },
    }),
    tool('process_kill', {
      group: 'core',
      description: 'Kill a process job started by shell.',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          job_id: { type: 'string' },
        },
        required: ['job_id'],
      },
      execute: (input) => {
        const parsed = input as ProcessKillInput;
        const ok = jobs.kill(parsed.job_id);
        const result: ProcessKillResult = {
          jobId: parsed.job_id,
          status: jobs.get(parsed.job_id)?.status ?? 'missing',
          ok,
        };
        return result;
      },
    }),
  ];
}
