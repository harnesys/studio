import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { NotFoundError } from '../../domain/studio.error.ts';

export type CancelRunRequest = {
  runId: string;
};

export type CancelRunInput = {
  execute(request: CancelRunRequest): Promise<{ ok: true }>;
};

export class CancelRunUseCase implements CancelRunInput {
  constructor(private readonly activeRuns: ActiveRunRegistry) {}

  execute(request: CancelRunRequest): Promise<{ ok: true }> {
    if (!this.activeRuns.cancel(request.runId)) {
      return Promise.reject(new NotFoundError('run not found'));
    }
    return Promise.resolve({ ok: true });
  }
}
