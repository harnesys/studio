import { MIN_PREFIX_LEN } from '../../constants.ts';
import type { JsonSchema } from '../../domain/json-schema.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { PlanItemStatus, SubagentRole } from '../../domain/plan.ts';
import type { PlanItem, PlanPort } from '../../ports/plan.ts';
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
            description:
              'Optional recommended subagent role: explore, coder, verifier, or general.',
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
async function runGuard<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      error: string;
    }
> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
function validPlanIds(items: PlanItem[]): string {
  const shown = items.slice(0, 10).map((i) => `${i.order}:${i.id} "${i.title}"`);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ');
}
function normalizePlanItemQuery(raw: string): string {
  let query = raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  query = query.replace(/^(id|item)\s*[:=]\s*/i, '');
  query = query.replace(/^[<("'`«»„“‘[]+/, '').replace(/[\])}>"'`«»„“‘.,;:!?]+$/, '');
  return query.trim();
}
function resolvePlanItemId(
  items: PlanItem[],
  rawQuery: string,
):
  | {
      id: string;
    }
  | {
      error: string;
    } {
  const query = normalizePlanItemQuery(rawQuery);
  if (!query) {
    return {
      error: `Plan item id is required. Valid ids: ${validPlanIds(items)}. Use id, unique id prefix, or order from plan_get.`,
    };
  }
  const exact = items.find((i) => i.id.toLowerCase() === query.toLowerCase());
  if (exact) {
    return { id: exact.id };
  }
  if (/^\d+$/.test(query)) {
    const byOrder = items.find((i) => i.order === Number(query));
    if (byOrder) {
      return { id: byOrder.id };
    }
  }
  if (query.length >= MIN_PREFIX_LEN) {
    const folded = query.toLowerCase();
    const prefixed = items.filter((i) => i.id.toLowerCase().startsWith(folded));
    if (prefixed.length === 1 && prefixed[0]) {
      return { id: prefixed[0].id };
    }
    if (prefixed.length > 1) {
      return {
        error: `Ambiguous plan item "${query}": matches ${validPlanIds(prefixed)}. Use the full id or order.`,
      };
    }
  }
  return {
    error: `Plan item "${query}" not found. Valid ids: ${validPlanIds(items)}. Use id, unique id prefix, or order from plan_get.`,
  };
}
export function createPlanTools(deps: CreatePlanToolsParams): ToolDefinition[] {
  return [
    tool('plan_save', {
      group: 'plan',
      description:
        'Create or overwrite the execution plan for this thread. One plan per thread: saving again replaces it. Write the plan before starting multi-step work, then track progress with plan_item_update. Call plan_save alone and wait for its result before calling plan_item_update: parallel calls in one batch read a stale plan.',
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
            items: plan.items.map((item) => ({
              id: item.id,
              order: item.order,
              title: item.title,
            })),
            message: `Plan with ${plan.items.length} tasks saved to database and rendered in Inspector.`,
          };
        }),
    }),
    tool('plan_item_update', {
      group: 'plan',
      description:
        'Update status of a specific task item in the thread plan. Accepts the id, a unique id prefix (8+ chars), or the order number from plan_get output. Pass the bare id without id: prefix, quotes, or trailing punctuation. Always update status as you progress!',
      input: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'Plan item id, unique id prefix, or order number from plan_get.',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
            description: 'New status of the plan item',
          },
          resultNote: {
            type: 'string',
            description:
              'Brief note or summary of what was accomplished or why it failed. Overwrites the previous note.',
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
          const query = typeof input.itemId === 'string' ? input.itemId : '';
          const resolved = resolvePlanItemId(currentPlan.items, query);
          if ('error' in resolved) {
            return { error: resolved.error };
          }
          const result = await deps.plan.updateItem(scope, {
            planId: currentPlan.id,
            itemId: resolved.id,
            status: input.status,
            resultNote: input.resultNote,
          });
          const item = result.items.find((i) => i.id === resolved.id);
          return {
            ok: true,
            itemId: item?.id ?? resolved.id,
            status: item?.status ?? input.status,
            planStatus: result.status,
          };
        }),
    }),
    tool('plan_delete', {
      group: 'plan',
      description:
        'Delete the execution plan for this thread and clear it from the Inspector. Use when the goal is abandoned. When the goal continues with changes, prefer plan_save as the replan path.',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const result = await deps.plan.delete(scope);
          return {
            ok: true,
            deleted: result.deleted,
            message: result.deleted ? 'Plan deleted.' : 'No active plan found for this thread.',
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
