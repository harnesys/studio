import { XIcon } from 'lucide-react';

import { fileExtLabel, formatBytes } from '@/shared/lib/file-meta';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/shared/ui/attachment';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';

export function FileChip({
  name,
  mediaType,
  bytes,
  href,
  previewUrl,
  onRemove,
}: {
  name: string;
  mediaType: string;
  bytes?: number;
  href?: string;
  previewUrl?: string;
  onRemove?: () => void;
}) {
  const image = Boolean(previewUrl || mediaType.startsWith('image/'));
  const detail = [fileExtLabel(name, mediaType), bytes != null ? formatBytes(bytes) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Attachment size="sm" orientation={image ? 'vertical' : 'horizontal'} className="max-w-56">
      <AttachmentMedia variant={previewUrl ? 'image' : 'icon'}>
        {previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          <FileTypeIcon name={name} mediaType={mediaType} />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={name}>{name}</AttachmentTitle>
        {detail ? <AttachmentDescription>{detail}</AttachmentDescription> : null}
      </AttachmentContent>
      {onRemove ? (
        <AttachmentActions>
          <AttachmentAction type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
      {href ? <AttachmentTrigger render={<a href={href} download={name} />} /> : null}
    </Attachment>
  );
}
