import {
  PLAN_ITEM_STATUSES,
  type PlanItemRecord,
  type ThreadPlanRecord,
  type UpdatePlanItemRequest,
} from '../../../shared/types.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { UnitOfWork } from '../../domain/unit-of-work.port.ts';

export type UpdatePlanItemResponse = {
  item: PlanItemRecord;
  plan: ThreadPlanRecord;
};

export type UpdatePlanItemInput = {
  execute(request: UpdatePlanItemRequest): Promise<UpdatePlanItemResponse>;
};

export class UpdatePlanItemUseCase implements UpdatePlanItemInput {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly deskEvents: DeskEventsPort,
  ) {}

  async execute(request: UpdatePlanItemRequest): Promise<UpdatePlanItemResponse> {
    if (!request.planId?.trim()) {
      throw new ValidationError('planId is required');
    }
    if (!request.itemId?.trim()) {
      throw new ValidationError('itemId is required');
    }
    if (!request.status) {
      throw new ValidationError('status is required');
    }
    if (!(PLAN_ITEM_STATUSES as readonly string[]).includes(request.status)) {
      throw new ValidationError(`status must be one of ${PLAN_ITEM_STATUSES.join(', ')}`);
    }

    const result = this.uow.run(({ plans, threads }) => {
      const plan = plans.getById(request.planId);
      if (!plan) {
        throw new NotFoundError('plan not found');
      }
      const thread = threads.findById(plan.threadId);
      if (!thread) {
        throw new NotFoundError('thread not found');
      }

      const item = plans.updateItemStatus({
        planId: request.planId,
        itemId: request.itemId,
        status: request.status,
        resultNote: request.resultNote,
      });

      if (!item) {
        throw new NotFoundError('plan item not found');
      }

      const updatedPlan = plans.getById(request.planId);
      if (!updatedPlan) {
        throw new NotFoundError('plan not found');
      }

      const allDone = updatedPlan.items.every(
        (i) => i.status === 'completed' || i.status === 'cancelled',
      );
      const allCancelled =
        updatedPlan.items.length > 0 && updatedPlan.items.every((i) => i.status === 'cancelled');
      const hasFailed = updatedPlan.items.some((i) => i.status === 'failed');
      const anyInProgress = updatedPlan.items.some((i) => i.status === 'in_progress');

      let targetStatus = updatedPlan.status;
      if (allDone) {
        targetStatus = allCancelled ? 'cancelled' : 'completed';
      } else if (anyInProgress || hasFailed) {
        targetStatus = 'in_progress';
      }

      if (targetStatus !== updatedPlan.status) {
        plans.updatePlanStatus(request.planId, targetStatus);
      }

      const finalPlan = plans.getById(request.planId);
      if (!finalPlan) {
        throw new NotFoundError('plan not found');
      }

      return {
        item,
        plan: finalPlan,
        workspaceId: thread.workspaceId,
      };
    });

    this.deskEvents.emit(result.workspaceId, {
      type: 'plan',
      plan: result.plan,
    });

    return await Promise.resolve({ item: result.item, plan: result.plan });
  }
}
