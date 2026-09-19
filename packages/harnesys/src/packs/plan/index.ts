import { definePack } from '../../domain/pack.ts';
import type { PlanPort, PlanSnapshot } from '../../ports/plan.ts';
import { createPlanTools } from './create-plan-tools.ts';
export type PlanCapabilityPorts = {
  plan: PlanPort;
};
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function planItemsBlock(
  items: Array<{
    id: string;
    order: number;
    title: string;
    status: string;
  }>,
): string {
  return items
    .map((i) => `- [${i.status}] id:${i.id} order:${i.order} title:"${escapeXml(i.title)}"`)
    .join('\n');
}
function activePlanText(
  plan: PlanSnapshot,
  nextItem: {
    id: string;
    title: string;
    description: string;
  },
): string {
  return `<active-plan>
Plan overview: "${escapeXml(plan.overview)}"
Tasks (use id, unique id prefix, or order from this list for plan_item_update):
${planItemsBlock(plan.items)}
Next task: id:${nextItem.id} "${escapeXml(nextItem.title)}" — ${escapeXml(nextItem.description)}
For each task: call plan_item_update with the id, unique id prefix, or order to mark in_progress, implement, verify, then mark completed (or failed) with resultNote. Do not invent ids — use one from the list above; if unsure call plan_get.
</active-plan>`;
}
export const planCapability = definePack<PlanCapabilityPorts, Record<string, unknown>>({
  name: 'plan',
  version: '1.0.0',
  description: 'Thread execution plans: plan_save / plan_item_update / plan_get',
  icon: 'plan',
  meta: {
    tools: [
      {
        name: 'plan_save',
        description: 'Create or overwrite the execution plan for this thread.',
      },
      {
        name: 'plan_item_update',
        description: 'Update status of a specific task item in the thread plan.',
      },
      {
        name: 'plan_get',
        description: 'Get current execution plan and tasks status for this thread.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createPlanTools({
      plan: ctx.ports.plan,
      resolveScope: () => ctx.scope,
    }),
    notes: async () => {
      let plan: PlanSnapshot | null = null;
      try {
        plan = await ctx.ports.plan.get(ctx.scope);
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
      return [{ tag: 'active-plan', text: activePlanText(plan, next) }];
    },
  }),
});
