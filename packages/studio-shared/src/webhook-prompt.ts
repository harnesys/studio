export const WEBHOOK_HUMAN_ORIGIN = 'webhook';
export function webhookTaskText(name: string, payload?: string): string {
  const head = `[webhook:${name}]`;
  return payload?.trim() ? `${head} ${payload.trim()}` : `${head} triggered`;
}
