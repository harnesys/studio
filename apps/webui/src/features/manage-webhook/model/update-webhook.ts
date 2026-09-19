import { toClientWebhook, useWebhookStore, type Webhook } from '@/entities/webhook';
import { type UpdateWebhookInput, updateWebhookRecord } from '@/shared/api';
export async function updateWebhook(
  workspaceId: string,
  webhookId: string,
  patch: UpdateWebhookInput,
): Promise<Webhook | null> {
  const record = await updateWebhookRecord(workspaceId, webhookId, patch);
  const next = toClientWebhook(record);
  useWebhookStore.getState().upsert(next);
  return next;
}
