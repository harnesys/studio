const PLAN_MODE_BLOCK = /^<plan-mode>\n?([\s\S]*?)\n?<\/plan-mode>(?:\n\n)?/;

/** Body of a leading `<plan-mode>…</plan-mode>` inject, if present. */
export function extractPlanModePrompt(text: string): string | undefined {
  const match = text.match(PLAN_MODE_BLOCK);
  if (!match) {
    return undefined;
  }
  return (match[1] ?? '').replace(/\n$/, '');
}

/** Human text with a leading plan-mode inject removed. */
export function visiblePlanModeText(text: string): string {
  return text.replace(PLAN_MODE_BLOCK, '');
}

export function hasPlanModePrompt(text: string | undefined): boolean {
  return typeof text === 'string' && PLAN_MODE_BLOCK.test(text);
}
