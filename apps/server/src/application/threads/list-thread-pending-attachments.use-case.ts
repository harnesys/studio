import type { ThreadAttachment } from '@harnesys/studio-shared';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import { toThreadAttachment } from './attachment-kind.ts';
export type ListThreadPendingAttachmentsRequest = {
  threadId: string;
};
export type ListThreadPendingAttachmentsResponse = {
  items: ThreadAttachment[];
};
export type ListThreadPendingAttachmentsInput = {
  execute(
    request: ListThreadPendingAttachmentsRequest,
  ): Promise<ListThreadPendingAttachmentsResponse>;
};
export class ListThreadPendingAttachmentsUseCase implements ListThreadPendingAttachmentsInput {
  constructor(private readonly attachments: AttachmentRepository) {}
  execute(
    request: ListThreadPendingAttachmentsRequest,
  ): Promise<ListThreadPendingAttachmentsResponse> {
    const items = this.attachments.listPending(request.threadId).map(toThreadAttachment);
    return Promise.resolve({ items });
  }
}
