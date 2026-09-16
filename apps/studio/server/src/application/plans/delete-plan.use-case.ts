import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { UnitOfWork } from '../../domain/unit-of-work.port.ts';

export type DeletePlanRequest = {
  threadId: string;
};

export type DeletePlanResponse = {
  deleted: boolean;
};

export type DeletePlanInput = {
  execute(request: DeletePlanRequest): Promise<DeletePlanResponse>;
};

export class DeletePlanUseCase implements DeletePlanInput {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly deskEvents: DeskEventsPort,
  ) {}

  async execute(request: DeletePlanRequest): Promise<DeletePlanResponse> {
    if (!request.threadId?.trim()) {
      throw new ValidationError('threadId is required');
    }

    const result = this.uow.run(({ threads, plans }) => {
      const thread = threads.findById(request.threadId);
      if (!thread) {
        throw new NotFoundError('thread not found');
      }
      const existing = plans.getByThreadId(request.threadId);
      if (!existing) {
        return { deleted: false, workspaceId: thread.workspaceId };
      }
      plans.deleteByThreadId(request.threadId);
      return { deleted: true, workspaceId: thread.workspaceId };
    });

    if (result.deleted) {
      this.deskEvents.emit(result.workspaceId, {
        type: 'plan-deleted',
        threadId: request.threadId,
      });
    }

    return await Promise.resolve({ deleted: result.deleted });
  }
}
