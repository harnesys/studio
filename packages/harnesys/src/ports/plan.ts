import type { CapabilityScope } from '../domain/pack.ts';
import type { PlanItemStatus, PlanStatus, SubagentRole } from '../domain/plan.ts';

export type PlanItem = {
  id: string;
  order: number;
  title: string;
  description: string;
  status: PlanItemStatus;
  subagentRole?: SubagentRole | null;
  resultNote?: string | null;
};

export type PlanSnapshot = {
  id: string;
  status: PlanStatus;
  overview: string;
  items: PlanItem[];
};

export type PlanSaveItemInput = {
  title: string;
  description: string;
  subagentRole?: SubagentRole | null;
};

export type PlanPort = {
  save(
    scope: CapabilityScope,
    input: { overview: string; items: PlanSaveItemInput[] },
  ): Promise<PlanSnapshot>;
  updateItem(
    scope: CapabilityScope,
    input: { planId: string; itemId: string; status: PlanItemStatus; resultNote?: string | null },
  ): Promise<PlanSnapshot>;
  get(scope: CapabilityScope): Promise<PlanSnapshot | null>;
};
