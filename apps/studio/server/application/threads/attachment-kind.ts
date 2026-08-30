import { isHumanEntry, isTextAttachment } from '../../../shared/thread.ts';
import type {
  Modality,
  ThreadAttachment,
  ThreadAttachmentKind,
  ThreadRecord,
} from '../../../shared/types.ts';
import { MAX_ATTACHMENT_BYTES } from '../../config/constants.ts';
import type { Attachment } from '../../domain/attachment.port.ts';

export { isTextAttachment, MAX_ATTACHMENT_BYTES };

export function toThreadAttachment(row: Attachment): ThreadAttachment {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mediaType: row.mediaType,
    path: row.path,
  };
}

export function kindFromMediaType(mediaType: string): ThreadAttachmentKind {
  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  if (mediaType.startsWith('video/')) {
    return 'video';
  }
  return 'file';
}

export function modelAccepts(
  input: Modality[] | undefined,
  kind: ThreadAttachmentKind,
  mediaType: string,
  name: string,
): boolean {
  if (isTextAttachment(mediaType, name)) {
    return true;
  }
  return Boolean(input?.includes(kind));
}

function attachmentsOf(thread: ThreadRecord): ThreadAttachment[] {
  const out: ThreadAttachment[] = [];
  for (const entry of thread.journal.entries) {
    if (!isHumanEntry(entry) || !entry.attachments) {
      continue;
    }
    out.push(...entry.attachments);
  }
  return out;
}

export function threadAttachmentIds(thread: ThreadRecord): string[] {
  return attachmentsOf(thread).map((item) => item.id);
}

export function threadOwnsAttachment(thread: ThreadRecord, id: string): boolean {
  return attachmentsOf(thread).some((item) => item.id === id);
}
