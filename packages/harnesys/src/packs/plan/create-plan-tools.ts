import { PLAN_PROPOSE_TOOL } from '../../constants.ts';
import { AskUserInterrupt } from '../../domain/errors.ts';
import type { JsonSchema } from '../../domain/json-schema.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { PlanItemStatus, SubagentRole } from '../../domain/plan.ts';
import type { PlanPort, PlanSaveItemInput } from '../../ports/plan.ts';
import { type ToolContext, type ToolDefinition, tool } from '../../ports/tools.ts';

const PLAN_PROPOSE_RESUME_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['approve', 'revise'] },
    text: { type: 'string' },
  },
  required: ['action'],
};

export type CreatePlanToolsParams = {
  plan: PlanPort;
  resolveScope: () => CapabilityScope;
  /** When true, `plan_save` errors (Plan mode should use `plan_propose`). */
  blockDirectSave?: () => boolean;
};

type PlanBodyItem = {
  title: string;
  description: string;
  subagentRole?: SubagentRole | 'main';
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
            enum: ['explore', 'coder', 'verifier', 'general', 'main'],
            description:
              'Optional recommended subagent role. `main` is stored as general (the parent agent).',
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
    if (err instanceof AskUserInterrupt) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function asPlanBody(raw: unknown): PlanBodyInput {
  return raw as PlanBodyInput;
}

function toSaveItems(items: PlanBodyItem[]): PlanSaveItemInput[] {
  return items.map((item) => ({
    title: item.title,
    description: item.description,
    subagentRole: item.subagentRole === 'main' ? 'general' : item.subagentRole,
  }));
}

async function resumePlanPropose(
  deps: CreatePlanToolsParams,
  input: PlanBodyInput,
  resume: { action?: string; text?: string },
) {
  if (resume.action === 'revise') {
    return {
      ok: true as const,
      action: 'revise' as const,
      text: typeof resume.text === 'string' ? resume.text.trim() : '',
      message: 'User requested changes. Update the proposal message and call plan_propose again.',
    };
  }
  if (resume.action === 'approve') {
    const plan = await deps.plan.save(deps.resolveScope(), {
      overview: input.overview,
      items: toSaveItems(input.items),
      status: 'approved',
    });
    return {
      ok: true as const,
      action: 'approved' as const,
      planId: plan.id,
      totalItems: plan.items.length,
      status: plan.status,
      message: `Plan saved (${plan.items.length} tasks). Acknowledge briefly; user will Apply from the UI to start execution.`,
    };
  }
  return { error: `unknown plan_propose action: ${String(resume.action)}` };
}

function throwPlanPropose(input: PlanBodyInput): never {
  throw new AskUserInterrupt({
    prompt: 'Review the plan proposal and approve, request changes, or cancel.',
    source: 'plan_proposal',
    tool: {
      name: PLAN_PROPOSE_TOOL,
      input,
      toolCallId: '',
    },
    resumeSchema: PLAN_PROPOSE_RESUME_SCHEMA,
  });
}

export function createPlanTools(deps: CreatePlanToolsParams): ToolDefinition[] {
  return [
    tool(PLAN_PROPOSE_TOOL, {
      group: 'plan',
      description:
        'Propose a plan for user approval in Plan mode. Required last action of a Plan-mode research turn: this call opens Approve / Request changes / Cancel. Put SMART fields in each item description. Do not substitute a long chat message for this call. Parks until the user answers. On approve the host saves the plan; do not call plan_save in Plan mode.',
      input: PLAN_BODY_INPUT,
      execute: async (raw, ctx: ToolContext) => {
        try {
          const input = asPlanBody(raw);
          if (ctx.resume !== undefined && ctx.resume !== null) {
            return await resumePlanPropose(
              deps,
              input,
              ctx.resume as { action?: string; text?: string },
            );
          }
          throwPlanPropose(input);
        } catch (err) {
          if (err instanceof AskUserInterrupt) {
            throw err;
          }
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
    tool('plan_save', {
      group: 'plan',
      description:
        'Save or overwrite the execution plan for this thread. In Plan mode use plan_propose instead (save happens on Approve). Use plan_save in execution modes or when replacing an already approved plan without the proposal flow.',
      input: PLAN_BODY_INPUT,
      execute: async (raw) =>
        runGuard(async () => {
          if (deps.blockDirectSave?.()) {
            return {
              error: 'plan_save is blocked in Plan mode. Call plan_propose and wait for Approve.',
            };
          }
          const scope = deps.resolveScope();
          const input = asPlanBody(raw);
          const plan = await deps.plan.save(scope, {
            overview: input.overview,
            items: toSaveItems(input.items),
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
          const resolvedId =
            currentPlan.items.find((i) => i.id === input.itemId)?.id ??
            currentPlan.items.find((i) => String(i.order) === input.itemId)?.id ??
            input.itemId;
          if (!currentPlan.items.some((i) => i.id === resolvedId)) {
            return {
              error: `Plan item "${input.itemId}" not found. Valid ids: ${currentPlan.items.map((i) => `${i.order}:${i.id} "${i.title}"`).join(', ')}. Use exact id from plan_get.`,
            };
          }
          const result = await deps.plan.updateItem(scope, {
            planId: currentPlan.id,
            itemId: resolvedId,
            status: input.status,
            resultNote: input.resultNote,
          });
          const item = result.items.find((i) => i.id === resolvedId);
          return {
            ok: true,
            itemId: item?.id ?? resolvedId,
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
