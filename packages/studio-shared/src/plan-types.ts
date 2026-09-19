import type { PlanItemStatus, PlanStatus, SubagentRole } from 'harnesys/domain';

export type { PlanItemStatus, PlanStatus, SubagentRole } from 'harnesys/domain';
export { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES } from 'harnesys/domain';
export type PlanItemRecord = {
  id: string;
  planId: string;
  order: number;
  title: string;
  description: string;
  status: PlanItemStatus;
  subagentRole?: SubagentRole | null;
  resultNote?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ThreadPlanRecord = {
  id: string;
  threadId: string;
  status: PlanStatus;
  overview: string;
  items: PlanItemRecord[];
  createdAt: string;
  updatedAt: string;
};
export type SavePlanItemInput = {
  id?: string;
  title: string;
  description: string;
  subagentRole?: SubagentRole | null;
};
export type SavePlanRequest = {
  threadId: string;
  overview: string;
  items: SavePlanItemInput[];
  status?: PlanStatus;
};
export type UpdatePlanItemRequest = {
  planId: string;
  itemId: string;
  status: PlanItemStatus;
  resultNote?: string | null;
};
