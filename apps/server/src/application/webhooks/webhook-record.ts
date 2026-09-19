import type { WebhookRecord } from '@harnesys/studio-shared';
import type { Webhook } from '../../domain/webhook.port.ts';

export type { WebhookRecord };
export function toWebhookRecord(webhook: Webhook, publicOrigin?: string): WebhookRecord {
  return {
    id: webhook.id,
    workspaceId: webhook.workspaceId,
    name: webhook.name,
    status: webhook.status,
    targetAgentId: webhook.targetAgentId,
    detail: webhook.detail,
    endpoint: withPublicOrigin(webhook.endpoint, publicOrigin),
    threadId: webhook.threadId,
    lastFiredAt: webhook.lastFiredAt,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}
export function withPublicOrigin(endpoint: string, publicOrigin?: string): string {
  if (!publicOrigin || /^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  const origin = publicOrigin.replace(/\/$/, '');
  return endpoint.startsWith('/') ? `${origin}${endpoint}` : `${origin}/${endpoint}`;
}
