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
