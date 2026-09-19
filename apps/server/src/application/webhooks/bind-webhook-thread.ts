import { ValidationError } from '../../domain/studio.error.ts';
import type { Thread, ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
export type BindWebhookThreadInput = {
  threads: ThreadRepository;
  webhooks: WebhookRepository;
  workspaceId: string;
  agentId: string;
  threadId: string;
  exceptWebhookId?: string;
};
export function requireBindableWebhookThread(input: BindWebhookThreadInput): Thread {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new ValidationError('threadId cannot be empty');
  }
  const thread = input.threads.findById(threadId);
  if (!thread || thread.workspaceId !== input.workspaceId) {
    throw new ValidationError('thread not found');
  }
  if (thread.agentId !== input.agentId) {
    throw new ValidationError('thread belongs to another agent');
  }
  const occupied = input.webhooks.findByThreadId(thread.id);
  if (occupied && occupied.id !== input.exceptWebhookId) {
    throw new ValidationError('thread already has a webhook');
  }
  return thread;
}
