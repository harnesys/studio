import type { Modality } from '../../../shared/types.ts';
import { MAX_ATTACHMENT_BYTES } from '../../config/constants.ts';
import type { Attachment, AttachmentKind } from '../../domain/attachment.port.ts';

export { MAX_ATTACHMENT_BYTES };

export type ThreadAttachmentKind = AttachmentKind;

export type ThreadAttachment = {
  id: string;
  kind: ThreadAttachmentKind;
  name: string;
  mediaType: string;
  path: string;
};

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
  return Boolean(input?.includes(kind));
}
