import { type ToolDefinition, tool } from 'harnesys';
import type { PlanItemStatus, SubagentRole } from '../../../shared/types.ts';
import { requireHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { GetThreadPlanInput } from '../plans/get-thread-plan.use-case.ts';
import type { SavePlanInput } from '../plans/save-plan.use-case.ts';
import type { UpdatePlanItemInput } from '../plans/update-plan-item.use-case.ts';
import { runHostTool } from './run-host-tool.ts';

export type PlanToolsDeps = {
  savePlan: SavePlanInput;
  updatePlanItem: UpdatePlanItemInput;
  getThreadPlan: GetThreadPlanInput;
};

export function createPlanTools(deps: PlanToolsDeps): ToolDefinition[] {
  return [
    tool('plan_save', {
      group: 'plan',
      description:
        'Save or overwrite the execution plan for this thread. Use in Plan mode or when replanning. Creates structured checklist with detailed steps for each todo item.',
      input: {
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
                  description: 'Optional recommended subagent role for this task',
                },
              },
              required: ['title', 'description'],
            },
            minItems: 1,
            description: 'List of ordered tasks to accomplish the objective',
          },
        },
        required: ['overview', 'items'],
      },
      execute: async (raw) =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as {
            overview: string;
            items: Array<{ title: string; description: string; subagentRole?: SubagentRole }>;
          };
          const plan = await deps.savePlan.execute({
            threadId: scope.threadId,
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
        'Update status of a specific task item in the thread plan. Use exact id from plan_get output — do not invent ids like "0". Call plan_get first if you do not have the id. Always update status as you progress!',
      input: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description:
              'Exact ID of the plan item from plan_get (UUID). Do not guess "0" or numeric order.',
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
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as {
            itemId: string;
            status: PlanItemStatus;
            resultNote?: string;
          };
          const currentPlan = await deps.getThreadPlan.execute({ threadId: scope.threadId });
          if (!currentPlan) {
            return { error: 'No active plan found for this thread. Call plan_get to verify.' };
          }
          const resolvedId =
            currentPlan.items.find((i) => i.id === input.itemId)?.id ??
            currentPlan.items.find((i) => String(i.order) === input.itemId)?.id ??
            input.itemId;
          if (!currentPlan.items.some((i) => i.id === resolvedId)) {
            return {
              error: `Plan item "${input.itemId}" not found. Valid ids: ${currentPlan.items.map((i) => `${i.order}:${i.id} "${i.title}"`).join(', ')}. Use exact id from plan_get.`,
            };
          }
          const result = await deps.updatePlanItem.execute({
            planId: currentPlan.id,
            itemId: resolvedId,
            status: input.status,
            resultNote: input.resultNote,
          });
          return {
            ok: true,
            itemId: result.item.id,
            status: result.item.status,
            planStatus: result.plan.status,
          };
        }),
    }),
    tool('plan_get', {
      group: 'plan',
      description: 'Get current execution plan and tasks status for this thread.',
      input: { type: 'object' },
      execute: async () =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const plan = await deps.getThreadPlan.execute({ threadId: scope.threadId });
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
