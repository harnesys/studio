import { WEBHOOK_HUMAN_ORIGIN, webhookTaskText } from '@harnesys/studio-shared';
import type { RunLifecycleStore } from 'harnesys';
import type { ScheduleFireQueue } from '../../adapters/schedule-fire-queue.adapter.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { GetThreadInput } from '../threads/get-thread.use-case.ts';
import { publishDeskThread } from '../threads/publish-desk-thread.ts';
import type { SendThreadRunInput } from '../threads/send-thread-run.use-case.ts';
import { toWebhookRecord } from './webhook-record.ts';
export type FireWebhookInput = {
  execute(request: { webhookId: string; text?: string }): Promise<{
    runId: string;
  } | null>;
};
export type FireWebhookDeps = {
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  sendThreadRun: SendThreadRunInput;
  lifecycle: RunLifecycleStore;
  queue: ScheduleFireQueue;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  publicOrigin?: string;
};
export class FireWebhookUseCase implements FireWebhookInput {
  private readonly webhooks: WebhookRepository;
  private readonly threads: ThreadRepository;
  private readonly sendThreadRun: SendThreadRunInput;
  private readonly lifecycle: RunLifecycleStore;
  private readonly queue: ScheduleFireQueue;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;
  private readonly publicOrigin?: string;
  constructor(deps: FireWebhookDeps) {
    this.webhooks = deps.webhooks;
    this.threads = deps.threads;
    this.sendThreadRun = deps.sendThreadRun;
    this.lifecycle = deps.lifecycle;
    this.queue = deps.queue;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
    this.publicOrigin = deps.publicOrigin;
  }
  async execute(request: { webhookId: string; text?: string }) {
    const webhook = this.webhooks.findById(request.webhookId);
    if (!webhook) {
      throw new NotFoundError('webhook not found');
    }
    if (webhook.status !== 'active') {
      return null;
    }
    if (await this.lifecycle.activeByThread(webhook.threadId)) {
      this.queue.enqueue(webhook.threadId, webhook.id);
      return null;
    }
    const now = new Date().toISOString();
    const updated = this.webhooks.update(webhook.id, { lastFiredAt: now, updatedAt: now });
    this.deskEvents.emit(webhook.workspaceId, {
      type: 'webhook',
      webhook: toWebhookRecord(updated, this.publicOrigin),
    });
    try {
      const accepted = await this.sendThreadRun.execute({
        threadId: webhook.threadId,
        text: webhookTaskText(webhook.name, request.text ?? webhook.detail),
        mode: 'ask',
        origin: WEBHOOK_HUMAN_ORIGIN,
      });
      this.threads.touch(webhook.threadId);
      publishDeskThread(this.getThread, this.deskEvents, webhook.threadId);
      return accepted;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fire failed';
      if (
        error instanceof NotFoundError ||
        (error instanceof ValidationError && error.message === 'agent has no model')
      ) {
        this.webhooks.update(webhook.id, { status: 'failed', updatedAt: now });
        this.deskEvents.emit(webhook.workspaceId, {
          type: 'webhook',
          webhook: toWebhookRecord(
            this.webhooks.findById(webhook.id) ?? updated,
            this.publicOrigin,
          ),
        });
      }
      throw new ValidationError(`webhook fire failed: ${message}`);
    }
  }
}
