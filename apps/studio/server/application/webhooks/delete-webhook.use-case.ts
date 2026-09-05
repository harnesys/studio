import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { AttachmentsPort } from '../../domain/attachments.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type DeleteWebhookRequest = {
  workspaceId: string;
  id: string;
};

export type DeleteWebhookInput = {
  execute(request: DeleteWebhookRequest): Promise<void>;
};

export type DeleteWebhookDeps = {
  webhooks: WebhookRepository;
  threads: ThreadRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  deskEvents: DeskEventsPort;
};

export class DeleteWebhookUseCase implements DeleteWebhookInput {
  private readonly webhooks: WebhookRepository;
  private readonly threads: ThreadRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly attachments: AttachmentRepository;
  private readonly attachmentsFs: AttachmentsPort;
  private readonly deskEvents: DeskEventsPort;

  constructor(deps: DeleteWebhookDeps) {
    this.webhooks = deps.webhooks;
    this.threads = deps.threads;
    this.workspaces = deps.workspaces;
    this.attachments = deps.attachments;
    this.attachmentsFs = deps.attachmentsFs;
    this.deskEvents = deps.deskEvents;
  }

  async execute(request: DeleteWebhookRequest): Promise<void> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const webhook = this.webhooks.findById(request.id);
    if (!webhook || webhook.workspaceId !== request.workspaceId) {
      throw new NotFoundError('webhook not found');
    }

    const thread = this.threads.findById(webhook.threadId);
    if (thread?.kind === 'webhook') {
      const attachmentIds = this.attachments.listByThread(thread.id).map((a) => a.id);
      this.threads.delete(thread.id);
      if (attachmentIds.length > 0) {
        await this.attachmentsFs.remove(workspace.path, thread.id, attachmentIds);
      }
    }

    this.webhooks.delete(webhook.id);
    this.deskEvents.emit(request.workspaceId, { type: 'webhook-deleted', id: webhook.id });
  }
}
