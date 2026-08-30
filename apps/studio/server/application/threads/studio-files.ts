import { ATTACHMENTS_DIR, STUDIO_DIR } from '../../adapters/store/studio-layout.ts';

export function sanitizeFileName(name: string): string {
  const base = name.replaceAll('\\', '/').split('/').pop()?.trim() || 'file';
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/u, '');
  return cleaned || 'file';
}

export function attachmentRelPath(threadId: string, id: string, name: string): string {
  return `${STUDIO_DIR}/threads/${threadId}/${ATTACHMENTS_DIR}/${id}/${sanitizeFileName(name)}`;
}
