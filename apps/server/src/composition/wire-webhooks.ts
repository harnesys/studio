import type { RunLifecycleStore } from 'harnesys';
import type { Hono } from 'hono';
import { WebhookController } from '../adapters/http/webhook/webhook.controller.ts';
import type { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import type { GetThreadInput } from '../application/threads/get-thread.use-case.ts';
import type { SendThreadRunInput } from '../application/threads/send-thread-run.use-case.ts';
import { CreateWebhookUseCase } from '../application/webhooks/create-webhook.use-case.ts';
import { DeleteWebhookUseCase } from '../application/webhooks/delete-webhook.use-case.ts';
import { FireWebhookUseCase } from '../application/webhooks/fire-webhook.use-case.ts';
import { ListWebhooksUseCase } from '../application/webhooks/list-webhooks.use-case.ts';
import { UpdateWebhookUseCase } from '../application/webhooks/update-webhook.use-case.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { AttachmentRepository } from '../domain/attachment.port.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { DeskEventsPort } from '../domain/desk-events.port.ts';
import type { MachineConfigPort } from '../domain/machine-config.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { WebhookRepository } from '../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';

export type WireWebhooksDeps = {
  app: Hono;
  db: StudioDb;
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  lifecycle: RunLifecycleStore;
  deskEvents: DeskEventsPort;
  sendThreadRun: SendThreadRunInput;
  getThread: GetThreadInput;
  queue: ScheduleFireQueue;
  machineConfig: MachineConfigPort;
};

export function wireWebhooks(deps: WireWebhooksDeps): void {
  const queue = deps.queue;
  const publicOrigin = deps.machineConfig.read().host.publicOrigin;
  const fireWebhook = new FireWebhookUseCase({
    webhooks: deps.webhooks,
    threads: deps.threads,
    sendThreadRun: deps.sendThreadRun,
    lifecycle: deps.lifecycle,
    queue,
    deskEvents: deps.deskEvents,
    getThread: deps.getThread,
    publicOrigin,
  });
  queue.setHandler((webhookId) => fireWebhook.execute({ webhookId }).then(() => undefined));

  new WebhookController({
    listWebhooks: new ListWebhooksUseCase(deps.webhooks, deps.workspaces, publicOrigin),
    createWebhook: new CreateWebhookUseCase({
      webhooks: deps.webhooks,
      threads: deps.threads,
      agents: deps.agents,
      workspaces: deps.workspaces,
      deskEvents: deps.deskEvents,
      getThread: deps.getThread,
      db: deps.db,
      publicOrigin,
    }),
    updateWebhook: new UpdateWebhookUseCase({
      webhooks: deps.webhooks,
      agents: deps.agents,
      workspaces: deps.workspaces,
      threads: deps.threads,
      deskEvents: deps.deskEvents,
      publicOrigin,
    }),
    deleteWebhook: new DeleteWebhookUseCase({
      webhooks: deps.webhooks,
      threads: deps.threads,
      workspaces: deps.workspaces,
      attachments: deps.attachments,
      attachmentsFs: deps.attachmentsFs,
      deskEvents: deps.deskEvents,
      db: deps.db,
    }),
    fireWebhook,
  }).register(deps.app);
}
