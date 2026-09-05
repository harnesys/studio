import type { WebhookRecord } from '@studio/shared';

export const WEBHOOK_STATUSES = ['active', 'paused', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export function webhookStatusTone(
  status: WebhookStatus,
): 'idle' | 'live' | 'wait' | 'danger' | 'off' {
  switch (status) {
    case 'active':
      return 'live';
    case 'paused':
      return 'wait';
    case 'failed':
      return 'danger';
  }
}

export function webhookStatusLabel(status: WebhookStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
  }
}

export function webhookInk(status: WebhookStatus): string {
  switch (status) {
    case 'active':
      return 'text-live';
    case 'paused':
      return 'text-muted-foreground';
    case 'failed':
      return 'text-destructive';
  }
}

export type Webhook = {
  id: string;
  workspaceId: string;
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt?: string;
};

export function toClientWebhook(record: WebhookRecord): Webhook {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    status: record.status,
    targetAgentId: record.targetAgentId,
    detail: record.detail,
    endpoint: record.endpoint,
    threadId: record.threadId,
    lastFiredAt: record.lastFiredAt ?? undefined,
  };
}
