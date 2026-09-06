import type {
  CapabilityScope,
  PlanItemStatus,
  PlanPort,
  PlanSaveItemInput,
  PlanSnapshot,
} from 'harnesys';
import type { ThreadPlanRecord } from '../../../shared/types.ts';
import type { GetThreadPlanInput } from '../../application/plans/get-thread-plan.use-case.ts';
import type { SavePlanInput } from '../../application/plans/save-plan.use-case.ts';
import type { UpdatePlanItemInput } from '../../application/plans/update-plan-item.use-case.ts';

export type SqlitePlanPortDeps = {
  savePlan: SavePlanInput;
  updatePlanItem: UpdatePlanItemInput;
  getThreadPlan: GetThreadPlanInput;
};

function toSnapshot(plan: ThreadPlanRecord): PlanSnapshot {
  return {
    id: plan.id,
    status: plan.status,
    overview: plan.overview,
    items: plan.items.map(
      ({ id, order, title, description, status, subagentRole, resultNote }) => ({
        id,
        order,
        title,
        description,
        status,
        subagentRole,
        resultNote,
      }),
    ),
  };
}

export class SqlitePlanPort implements PlanPort {
  constructor(private readonly deps: SqlitePlanPortDeps) {}

  async save(
    scope: CapabilityScope,
    input: { overview: string; items: PlanSaveItemInput[] },
  ): Promise<PlanSnapshot> {
    const plan = await this.deps.savePlan.execute({
      threadId: scope.threadId,
      overview: input.overview,
      items: input.items,
    });
    return toSnapshot(plan);
  }

  async updateItem(
    _scope: CapabilityScope,
    input: { planId: string; itemId: string; status: PlanItemStatus; resultNote?: string | null },
  ): Promise<PlanSnapshot> {
    const result = await this.deps.updatePlanItem.execute({
      planId: input.planId,
      itemId: input.itemId,
      status: input.status,
      resultNote: input.resultNote,
    });
    return toSnapshot(result.plan);
  }

  async get(scope: CapabilityScope): Promise<PlanSnapshot | null> {
    const plan = await this.deps.getThreadPlan.execute({ threadId: scope.threadId });
    return plan ? toSnapshot(plan) : null;
  }
}
