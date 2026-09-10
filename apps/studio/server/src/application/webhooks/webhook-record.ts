import type { WebhookRecord } from '@harnesys/studio-shared';
import type { Webhook } from '../../domain/webhook.port.ts';

export type { WebhookRecord };

export function toWebhookRecord(webhook: Webhook): WebhookRecord {
  return {
    id: webhook.id,
    workspaceId: webhook.workspaceId,
    name: webhook.name,
    status: webhook.status,
    targetAgentId: webhook.targetAgentId,
    detail: webhook.detail,
    endpoint: webhook.endpoint,
    threadId: webhook.threadId,
    lastFiredAt: webhook.lastFiredAt,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}
