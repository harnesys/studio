import type { Webhook } from '../../domain/webhook.port.ts';

export type WebhookRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: Webhook['status'];
  targetAgentId: string;
  detail: string;
  endpoint: string;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toWebhookRecord(webhook: Webhook): WebhookRecord {
  return {
    id: webhook.id,
    workspaceId: webhook.workspaceId,
    name: webhook.name,
    status: webhook.status,
    targetAgentId: webhook.targetAgentId,
    detail: webhook.detail,
    endpoint: webhook.endpoint,
    lastFiredAt: webhook.lastFiredAt,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}
