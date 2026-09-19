import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
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
  db?: StudioDb;
};
export class DeleteWebhookUseCase implements DeleteWebhookInput {
  private readonly webhooks: WebhookRepository;
  private readonly threads: ThreadRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly attachments: AttachmentRepository;
  private readonly attachmentsFs: AttachmentsPort;
  private readonly deskEvents: DeskEventsPort;
  private readonly db?: StudioDb;
  constructor(deps: DeleteWebhookDeps) {
    this.webhooks = deps.webhooks;
    this.threads = deps.threads;
    this.workspaces = deps.workspaces;
    this.attachments = deps.attachments;
    this.attachmentsFs = deps.attachmentsFs;
    this.deskEvents = deps.deskEvents;
    this.db = deps.db;
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
    const ownedThreadId = thread?.kind === 'webhook' ? thread.id : null;
    const attachmentIds = ownedThreadId
      ? this.attachments.listByThread(ownedThreadId).map((row) => row.id)
      : [];
    const perform = () => {
      this.webhooks.delete(webhook.id);
      if (ownedThreadId) {
        this.threads.delete(ownedThreadId);
      }
    };
    if (this.db) {
      this.db.transaction(perform);
    } else {
      perform();
    }
    this.deskEvents.emit(request.workspaceId, { type: 'webhook-deleted', id: webhook.id });
    if (ownedThreadId && attachmentIds.length > 0) {
      await this.attachmentsFs.remove(workspace.path, ownedThreadId, attachmentIds);
    }
  }
}
