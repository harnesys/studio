import type {
  PlanItemRecord,
  PlanItemStatus,
  PlanStatus,
  SavePlanItemInput,
  ThreadPlanRecord,
} from '@harnesys/studio-shared';
export type PlanRepository = {
  getByThreadId(threadId: string): ThreadPlanRecord | null;
  getById(planId: string): ThreadPlanRecord | null;
  savePlan(input: {
    id: string;
    threadId: string;
    overview: string;
    status: PlanStatus;
    items: SavePlanItemInput[];
  }): ThreadPlanRecord;
  updateItemStatus(input: {
    planId: string;
    itemId: string;
    status: PlanItemStatus;
    resultNote?: string | null;
  }): PlanItemRecord | null;
  updatePlanStatus(planId: string, status: PlanStatus): ThreadPlanRecord | null;
  deleteByThreadId(threadId: string): void;
};
