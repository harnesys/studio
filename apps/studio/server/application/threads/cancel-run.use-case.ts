import type { RunLifecycleStore } from 'harnesys';
import type { ThreadSessions } from '../../adapters/thread-sessions.adapter.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import { mapCodedError } from './map-coded-error.ts';

export type CancelRunRequest = {
  runId: string;
};

export type CancelRunInput = {
  execute(request: CancelRunRequest): Promise<{ ok: true }>;
};

export type CancelRunDeps = {
  lifecycle: RunLifecycleStore;
  sessions: ThreadSessions;
};

export class CancelRunUseCase implements CancelRunInput {
  constructor(private readonly deps: CancelRunDeps) {}

  async execute(request: CancelRunRequest): Promise<{ ok: true }> {
    const rec = await this.deps.lifecycle.get(request.runId);
    if (!rec) {
      throw new NotFoundError('run not found');
    }
    const handle = await this.deps.sessions.forThread(rec.threadId);
    try {
      await handle.cancel(request.runId);
    } catch (error) {
      throw mapCodedError(error);
    }
    return { ok: true };
  }
}
