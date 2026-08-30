import type { ThreadAttachment } from '../../../shared/types.ts';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { AttachmentsPort } from '../../domain/attachments.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { toThreadAttachment } from './attachment-kind.ts';
import { sanitizeFileName } from './studio-files.ts';

export type GetThreadAttachmentRequest = {
  threadId: string;
  attachmentId: string;
};

export type StoredAttachment = {
  bytes: Uint8Array;
  meta: ThreadAttachment;
};

export type GetThreadAttachmentInput = {
  execute(request: GetThreadAttachmentRequest): Promise<StoredAttachment>;
};

export class GetThreadAttachmentUseCase implements GetThreadAttachmentInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly attachments: AttachmentRepository,
    private readonly attachmentsFs: AttachmentsPort,
  ) {}

  async execute(request: GetThreadAttachmentRequest): Promise<StoredAttachment> {
    const thread = this.threads.findById(request.threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    const attachment = this.attachments.findById(request.attachmentId);
    if (!attachment || attachment.threadId !== request.threadId) {
      throw new NotFoundError('attachment not found');
    }
    const workspace = this.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const bytes = await this.attachmentsFs.get(
      workspace.path,
      request.threadId,
      request.attachmentId,
      sanitizeFileName(attachment.name),
    );
    if (!bytes) {
      throw new NotFoundError('attachment not found');
    }
    return { bytes, meta: toThreadAttachment(attachment) };
  }
}
