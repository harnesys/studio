import { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES } from '../constants.ts';

export { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES };
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type SubagentRole = (typeof SUBAGENT_ROLES)[number];
