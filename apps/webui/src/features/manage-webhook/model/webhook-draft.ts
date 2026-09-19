import type { Agent } from '@/entities/agent';
import type { Webhook, WebhookStatus } from '@/entities/webhook';
export type WebhookFormDraft = {
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  threadId?: string;
};
export function draftFrom(item: Webhook): WebhookFormDraft {
  return {
    name: item.name,
    status: item.status,
    targetAgentId: item.targetAgentId,
    detail: item.detail,
    threadId: item.threadId,
  };
}
export function emptyWebhookDraft(agents: Agent[]): WebhookFormDraft {
  return {
    name: '',
    status: 'active',
    targetAgentId: agents[0]?.id ?? '',
    detail: '',
    threadId: undefined,
  };
}
