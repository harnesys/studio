import { readFileSync } from 'node:fs';
import { planModePromptPath } from '../../adapters/store/studio-layout.ts';

/** Forced inject for `runMode === 'plan'`. Body: `apps/studio/assets/plan-mode.md` (read each call so asset edits apply). */
export function planModePrompt(): string {
  return readFileSync(planModePromptPath(), 'utf8').trim();
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function planItemsBlock(
  items: Array<{ id: string; order: number; title: string; status: string }>,
): string {
  return items
    .map((i) => `- [${i.status}] id:${i.id} order:${i.order} title:"${escapeXml(i.title)}"`)
    .join('\n');
}

/** Plan execution reminder injected into runs that continue an existing plan. */
export function planFollowPrompt(
  plan: {
    overview: string;
    items: Array<{ id: string; order: number; title: string; description: string; status: string }>;
  },
  nextItem: { id: string; title: string; description: string },
): string {
  return `<active-plan>
Plan overview: "${escapeXml(plan.overview)}"
Tasks (use exact id from this list for plan_item_update):
${planItemsBlock(plan.items)}
Next task: id:${nextItem.id} "${escapeXml(nextItem.title)}" — ${escapeXml(nextItem.description)}
For each task: call plan_item_update with the exact id to mark in_progress, implement, verify, then mark completed (or failed) with resultNote. Do not invent ids like "0" — use id from the list above; if unsure call plan_get.
</active-plan>`;
}
