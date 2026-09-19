import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import {
  toClientWebhook,
  useWebhookStore,
  type Webhook,
  type WebhookDraft,
} from '@/entities/webhook';
import { createWebhookRecord } from '@/shared/api';
export async function createWebhook(
  workspaceId: string,
  draft: WebhookDraft,
): Promise<Webhook | null> {
  const name = draft.name.trim();
  if (!workspaceId || !name || !draft.targetAgentId) {
    return null;
  }
  const created = await createWebhookRecord(workspaceId, {
    name,
    targetAgentId: draft.targetAgentId,
    detail: draft.detail?.trim() || undefined,
    threadId: draft.threadId || undefined,
  });
  const webhook = toClientWebhook(created.webhook);
  useWebhookStore.getState().upsert(webhook);
  useThreadStore.getState().upsert(toClientThread(created.thread));
  if (created.thread.kind !== 'chat') {
    useSessionStore.getState().replaceEvents(created.thread.id, created.thread.events);
  }
  return webhook;
}
