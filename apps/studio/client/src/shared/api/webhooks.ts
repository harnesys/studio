import type { CreateWebhookResponse, WebhookRecord, WebhookStatus } from '@harnesys/studio-shared';

import { apiJson } from './client';

export type CreateWebhookInput = {
  name: string;
  targetAgentId: string;
  detail?: string;
  threadId?: string;
};

export type UpdateWebhookInput = {
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
  threadId?: string;
};

export function listWebhooks(workspaceId: string) {
  return apiJson<WebhookRecord[]>(`/api/workspaces/${workspaceId}/webhooks`);
}

export function createWebhookRecord(workspaceId: string, body: CreateWebhookInput) {
  return apiJson<CreateWebhookResponse>(`/api/workspaces/${workspaceId}/webhooks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateWebhookRecord(
  workspaceId: string,
  webhookId: string,
  body: UpdateWebhookInput,
) {
  return apiJson<WebhookRecord>(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteWebhookRecord(workspaceId: string, webhookId: string) {
  return apiJson<void>(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
    method: 'DELETE',
  });
}
