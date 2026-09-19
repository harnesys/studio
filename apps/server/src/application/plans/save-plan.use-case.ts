import type { SavePlanRequest, ThreadPlanRecord } from '@harnesys/studio-shared';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { UnitOfWork } from '../../domain/unit-of-work.port.ts';
export type SavePlanInput = {
  execute(request: SavePlanRequest): Promise<ThreadPlanRecord>;
};
export class SavePlanUseCase implements SavePlanInput {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly deskEvents: DeskEventsPort,
  ) {}
  async execute(request: SavePlanRequest): Promise<ThreadPlanRecord> {
    if (!request.threadId?.trim()) {
      throw new ValidationError('threadId is required');
    }
    if (!request.items || !Array.isArray(request.items) || request.items.length === 0) {
      throw new ValidationError('items array is required and must not be empty');
    }
    for (let i = 0; i < request.items.length; i += 1) {
      const item = request.items[i];
      if (!item.title?.trim()) {
        throw new ValidationError(`items[${i}].title is required`);
      }
      if (!item.description?.trim()) {
        throw new ValidationError(`items[${i}].description is required`);
      }
    }
    const { plan, workspaceId } = this.uow.run(({ threads, plans }) => {
      const thread = threads.findById(request.threadId);
      if (!thread) {
        throw new NotFoundError('thread not found');
      }
      return {
        plan: plans.savePlan({
          id: crypto.randomUUID(),
          threadId: request.threadId,
          overview: request.overview?.trim() || '',
          status: request.status === 'approved' ? 'approved' : 'draft',
          items: request.items,
        }),
        workspaceId: thread.workspaceId,
      };
    });
    this.deskEvents.emit(workspaceId, {
      type: 'plan',
      plan,
    });
    return await Promise.resolve(plan);
  }
}
