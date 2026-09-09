import { defineCapability } from '../../domain/pack.ts';
import type { PlanPort, PlanSnapshot } from '../../ports/plan.ts';
import { createPlanTools } from './create-plan-tools.ts';
import { PLAN_PROMPT_FRAGMENT, planFollowPrompt } from './prompt.ts';

export type PlanCapabilityPorts = { plan: PlanPort };

export const planCapability = defineCapability<PlanCapabilityPorts>({
  name: 'plan',
  version: '1.0.0',
  description: 'Thread execution plans: plan_save / plan_item_update / plan_get',
  requires: ['plan'],
  tools: (ctx) => createPlanTools({ plan: ctx.ports.plan, resolveScope: ctx.resolveScope }),
  prompt: () => PLAN_PROMPT_FRAGMENT,
  notes: (ctx) => async () => {
    let plan: PlanSnapshot | null = null;
    try {
      plan = await ctx.ports.plan.get(ctx.resolveScope());
    } catch {
      return [];
    }
    if (!plan || plan.status === 'completed' || plan.status === 'cancelled') {
      return [];
    }
    const next =
      plan.items.find((item) => item.status === 'in_progress') ??
      plan.items.find((item) => item.status === 'pending');
    if (!next) {
      return [];
    }
    return [{ tag: 'active-plan', text: planFollowPrompt(plan, next) }];
  },
});
