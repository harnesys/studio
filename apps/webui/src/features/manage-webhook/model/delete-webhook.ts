import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore, type Webhook } from '@/entities/webhook';
import { deleteWebhookRecord } from '@/shared/api';
export async function deleteWebhook(workspaceId: string, webhook: Webhook): Promise<boolean> {
  await deleteWebhookRecord(workspaceId, webhook.id);
  useWebhookStore.getState().remove(webhook.id);
  const thread = useThreadStore.getState().byId(webhook.threadId);
  if (thread?.kind === 'webhook') {
    useSessionStore.getState().removeForThreads([webhook.threadId]);
    useThreadStore.getState().remove(webhook.threadId);
    return true;
  }
  return false;
}
