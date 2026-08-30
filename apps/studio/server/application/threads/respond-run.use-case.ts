import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';

export type RespondRunRequest = {
  runId: string;
  askId: string;
  payload?: unknown;
};

export type RejectRunRequest = {
  runId: string;
  askId: string;
  note?: string;
};

export type RespondRunInput = {
  respond(request: RespondRunRequest): Promise<void>;
  reject(request: RejectRunRequest): Promise<void>;
};

export class RespondRunUseCase implements RespondRunInput {
  constructor(private readonly activeRuns: ActiveRunRegistry) {}

  async respond(request: RespondRunRequest): Promise<void> {
    const active = this.activeRuns.get(request.runId);
    if (!active) {
      throw new NotFoundError('run not found');
    }
    try {
      await active.run.respond(request.askId, request.payload);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'respond failed');
    }
  }

  async reject(request: RejectRunRequest): Promise<void> {
    const active = this.activeRuns.get(request.runId);
    if (!active) {
      throw new NotFoundError('run not found');
    }
    try {
      await active.run.reject(request.askId, { note: request.note });
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'reject failed');
    }
  }
}
