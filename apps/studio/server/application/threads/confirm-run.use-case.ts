import type { ConfirmDecision, HitlBatchSnapshot } from 'harnesys';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';

export type ConfirmRunRequest = {
  runId: string;
  stepId: string;
  decision: ConfirmDecision;
};

export type ConfirmRunInput = {
  execute(request: ConfirmRunRequest): Promise<HitlBatchSnapshot>;
};

export class ConfirmRunUseCase implements ConfirmRunInput {
  constructor(private readonly activeRuns: ActiveRunRegistry) {}

  async execute(request: ConfirmRunRequest): Promise<HitlBatchSnapshot> {
    const active = this.activeRuns.get(request.runId);
    if (!active) {
      throw new NotFoundError('run not found');
    }
    try {
      return await active.run.confirm(request.stepId, request.decision);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'confirm failed');
    }
  }
}
