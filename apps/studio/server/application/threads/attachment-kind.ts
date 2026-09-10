import {
  type AttachmentKind,
  isTextAttachment,
  type Modality,
  type ThreadAttachment,
} from '../../../shared/types.ts';
import { MAX_ATTACHMENT_BYTES } from '../../config/constants.ts';
import type { Attachment } from '../../domain/attachment.port.ts';

export type { ThreadAttachment };
export { MAX_ATTACHMENT_BYTES };

export function toThreadAttachment(row: Attachment): ThreadAttachment {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mediaType: row.mediaType,
    path: row.path,
  };
}

export function kindFromMediaType(mediaType: string): AttachmentKind {
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
  kind: AttachmentKind,
  mediaType: string,
  name: string,
): boolean {
  if (isTextAttachment(mediaType, name)) {
    return true;
  }
  return Boolean(input?.includes(kind));
}
