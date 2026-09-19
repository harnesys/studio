import type { RunClaimer, RunLifecycleStore } from 'harnesys';
import type { ThreadSessions } from '../../adapters/thread-sessions.adapter.ts';
import { NotFoundError, RunConflictError } from '../../domain/studio.error.ts';
import { mapCodedError } from './map-coded-error.ts';
export type RetryRunRequest = {
  runId: string;
};
export type RetryRunResponse = {
  runId: string;
};
export type RetryRunInput = {
  execute(request: RetryRunRequest): Promise<RetryRunResponse>;
};
export type RetryRunDeps = {
  lifecycle: RunLifecycleStore;
  sessions: ThreadSessions;
  claimer: RunClaimer;
};
export class RetryRunUseCase implements RetryRunInput {
  constructor(private readonly deps: RetryRunDeps) {}
  async execute(request: RetryRunRequest): Promise<RetryRunResponse> {
    const rec = await this.deps.lifecycle.get(request.runId);
    if (!rec) {
      throw new NotFoundError('run not found');
    }
    await this.deps.sessions.forThread(rec.threadId);
    if (rec.status === 'needs_input') {
      throw new RunConflictError({ code: 'ask_pending' });
    }
    if (rec.status === 'running') {
      const expired = rec.leaseExpiresAt !== undefined && rec.leaseExpiresAt < Date.now();
      if (!expired) {
        throw new RunConflictError({ code: 'lease_held' });
      }
    }
    try {
      await this.deps.lifecycle.transition(request.runId, rec.leaseEpoch, {
        from: rec.status,
        to: 'queued',
        advanceAttempt: true,
        events: [],
      });
    } catch (error) {
      throw mapCodedError(error);
    }
    this.deps.claimer.kick();
    return { runId: request.runId };
  }
}
