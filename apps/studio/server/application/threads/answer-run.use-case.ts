import type { AnswerInput, HitlBatchSnapshot } from 'harnesys';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';

export type AnswerRunRequest = {
  runId: string;
  stepId: string;
  input: AnswerInput;
};

export type AnswerRunInput = {
  execute(request: AnswerRunRequest): Promise<HitlBatchSnapshot>;
};

export class AnswerRunUseCase implements AnswerRunInput {
  constructor(private readonly activeRuns: ActiveRunRegistry) {}

  async execute(request: AnswerRunRequest): Promise<HitlBatchSnapshot> {
    const active = this.activeRuns.get(request.runId);
    if (!active) {
      throw new NotFoundError('run not found');
    }
    try {
      return await active.run.answer(request.stepId, request.input);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'answer failed');
    }
  }
}
