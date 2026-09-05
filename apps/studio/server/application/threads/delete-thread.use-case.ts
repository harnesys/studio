import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { AttachmentsPort } from '../../domain/attachments.port.ts';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import type { SemanticSessionCleanup } from '../../domain/semantic-session.port.ts';
import { ConflictError, NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type DeleteThreadRequest = {
  id: string;
};

export type DeleteThreadInput = {
  execute(request: DeleteThreadRequest): Promise<void>;
};

export type DeleteThreadDeps = {
  threads: ThreadRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  schedules?: ScheduleRepository;
  webhooks?: WebhookRepository;
  semanticSessions?: SemanticSessionCleanup;
};

export class DeleteThreadUseCase implements DeleteThreadInput {
  constructor(private readonly deps: DeleteThreadDeps) {}

  async execute(request: DeleteThreadRequest): Promise<void> {
    const thread = this.deps.threads.findById(request.id);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    if (thread.kind === 'schedule' || thread.kind === 'webhook') {
      throw new ConflictError('trigger thread belongs to its trigger');
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    const attachmentRows = this.deps.attachments.listByThread(request.id);
    const attachmentIds = attachmentRows.map((a) => a.id);
    const bound = this.deps.schedules?.findByThreadId(request.id);
    this.deps.semanticSessions?.deleteSessionByThread({
      workspaceId: thread.workspaceId,
      threadId: request.id,
    });
    if (bound) {
      this.deps.schedules?.delete(bound.id);
    }
    const boundWebhook = this.deps.webhooks?.findByThreadId(request.id);
    if (boundWebhook) {
      this.deps.webhooks?.delete(boundWebhook.id);
    }
    this.deps.threads.delete(request.id);
    if (workspace && attachmentIds.length > 0) {
      await this.deps.attachmentsFs.remove(workspace.path, request.id, attachmentIds);
    }
  }
}
