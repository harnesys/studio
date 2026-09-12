import type { JsonSchema } from '../../domain/json-schema.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { PlanItemStatus, SubagentRole } from '../../domain/plan.ts';
import type { PlanPort } from '../../ports/plan.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreatePlanToolsParams = {
  plan: PlanPort;
  resolveScope: () => CapabilityScope;
};

type PlanBodyItem = {
  title: string;
  description: string;
  subagentRole?: SubagentRole;
};

type PlanBodyInput = {
  overview: string;
  items: PlanBodyItem[];
};

const PLAN_BODY_INPUT = {
  type: 'object',
  properties: {
    overview: {
      type: 'string',
      description: 'Architecture overview and main goal of this plan',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Concise actionable title of the task' },
          description: {
            type: 'string',
            description:
              'Detailed technical requirements, files to touch, and verification criteria',
          },
          subagentRole: {
            type: 'string',
            enum: ['explore', 'coder', 'verifier', 'general'],
            description: 'Optional recommended subagent role.',
          },
        },
        required: ['title', 'description'],
      },
      minItems: 1,
      description: 'List of ordered tasks to accomplish the objective',
    },
  },
  required: ['overview', 'items'],
} as JsonSchema;

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function createPlanTools(deps: CreatePlanToolsParams): ToolDefinition[] {
  return [
    tool('plan_save', {
      group: 'plan',
      description:
        'Create or overwrite the execution plan for this thread. One plan per thread: saving again replaces it. Write the plan before starting multi-step work, then track progress with plan_item_update.',
      input: PLAN_BODY_INPUT,
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as PlanBodyInput;
          const plan = await deps.plan.save(scope, {
            overview: input.overview,
            items: input.items,
          });
          return {
            ok: true,
            planId: plan.id,
            totalItems: plan.items.length,
            status: plan.status,
            message: `Plan with ${plan.items.length} tasks saved to database and rendered in Inspector.`,
          };
        }),
    }),
    tool('plan_item_update', {
      group: 'plan',
      description:
        'Update status of a specific task item in the thread plan. Use exact id from plan_get output. Always update status as you progress!',
      input: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'Exact ID of the plan item from plan_get (UUID).',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
            description: 'New status of the plan item',
          },
          resultNote: {
            type: 'string',
            description: 'Brief note or summary of what was accomplished or why it failed',
          },
        },
        required: ['itemId', 'status'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as {
            itemId: string;
            status: PlanItemStatus;
            resultNote?: string;
          };
          const currentPlan = await deps.plan.get(scope);
          if (!currentPlan) {
            return { error: 'No active plan found for this thread. Call plan_get to verify.' };
          }
          if (!currentPlan.items.some((i) => i.id === input.itemId)) {
            return {
              error: `Plan item "${input.itemId}" not found. Valid ids: ${currentPlan.items.map((i) => `${i.order}:${i.id} "${i.title}"`).join(', ')}. Use exact id from plan_get.`,
            };
          }
          const result = await deps.plan.updateItem(scope, {
            planId: currentPlan.id,
            itemId: input.itemId,
            status: input.status,
            resultNote: input.resultNote,
          });
          const item = result.items.find((i) => i.id === input.itemId);
          return {
            ok: true,
            itemId: item?.id ?? input.itemId,
            status: item?.status ?? input.status,
            planStatus: result.status,
          };
        }),
    }),
    tool('plan_get', {
      group: 'plan',
      description: 'Get current execution plan and tasks status for this thread.',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const plan = await deps.plan.get(scope);
          if (!plan) {
            return { active: false, plan: null };
          }
          return {
            active: true,
            planId: plan.id,
            status: plan.status,
            overview: plan.overview,
            items: plan.items.map((item) => ({
              id: item.id,
              order: item.order,
              title: item.title,
              description: item.description,
              status: item.status,
              subagentRole: item.subagentRole,
              resultNote: item.resultNote,
            })),
          };
        }),
    }),
  ];
}
