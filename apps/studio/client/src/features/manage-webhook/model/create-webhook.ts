import { useWebhookStore, type Webhook, type WebhookDraft } from '@/entities/webhook';

export function createWebhook(workspaceId: string, draft: WebhookDraft): Webhook | null {
  return useWebhookStore.getState().create(workspaceId, draft);
}
