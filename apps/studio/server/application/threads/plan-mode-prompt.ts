export const PLAN_MODE_PROMPT = `<plan-mode>
Plan mode is active. The user wants a plan before any changes.
You MUST NOT modify files, run shell commands, or perform side effects. Read-only exploration only.

Workflow:
1. Study the request and the relevant code (read files, search, ask the user questions if requirements are unclear).
2. Decompose the task into small, ordered, verifiable steps.
3. Call the \`plan_save\` tool with:
   - overview: the goal and approach in a few sentences
   - items: one entry per step; title is a short imperative headline,
     description carries full technical detail (files, approach, verification criteria),
     subagentRole when a specialized worker fits (explore / coder / verifier)
4. Finish your message by telling the user the plan is ready in the Inspector and they can switch the composer mode to an execution mode to start.

Keep exactly one active plan per thread: calling plan_save again replaces it (replanning).
</plan-mode>`;

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
