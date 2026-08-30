export const PLAN_ITEM_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

export const PLAN_STATUSES = [
  'draft',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const SUBAGENT_ROLES = ['explore', 'coder', 'verifier', 'general'] as const;
export type SubagentRole = (typeof SUBAGENT_ROLES)[number];

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
};

export type UpdatePlanItemRequest = {
  planId: string;
  itemId: string;
  status: PlanItemStatus;
  resultNote?: string | null;
};
