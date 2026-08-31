import type { HumanEntry, ThreadAttachment } from '@studio/shared';
import { attachmentUrl } from '@/shared/api';
import { FileChip } from '@/shared/ui/file-chip';

export function MessageAttachments({ entry, threadId }: { entry: HumanEntry; threadId: string }) {
  const attachments = entry.attachments;
  if (!attachments?.length) {
    return null;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map((item: ThreadAttachment) => (
        <AttachmentPreview key={item.id} threadId={threadId} item={item} />
      ))}
    </div>
  );
}

function AttachmentPreview({ threadId, item }: { threadId: string; item: ThreadAttachment }) {
  const src = attachmentUrl(threadId, item.id);
  if (item.kind === 'audio') {
    return (
      <audio controls src={src} className="h-9 max-w-64">
        <track kind="captions" />
      </audio>
    );
  }
  if (item.kind === 'video') {
    return (
      <video controls src={src} className="max-h-48 max-w-64 rounded-xl">
        <track kind="captions" />
      </video>
    );
  }
  return (
    <FileChip
      name={item.name}
      mediaType={item.mediaType ?? ''}
      href={src}
      previewUrl={item.kind === 'image' ? src : undefined}
    />
  );
}
