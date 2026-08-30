import type { OpenFileKind } from '@/features/open-file';
import { workspaceFileContentUrl } from '@/shared/api/files';

export function MediaPreview({
  workspaceId,
  path,
  kind,
}: {
  workspaceId: string;
  path: string;
  kind: Extract<OpenFileKind, 'image' | 'pdf'>;
}) {
  const url = workspaceFileContentUrl(workspaceId, path);

  if (kind === 'pdf') {
    return (
      <iframe
        title={path}
        src={url}
        className="h-full w-full border-0 bg-background"
        data-testid="pdf-preview"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted/20 p-4">
      <img
        src={url}
        alt={path}
        className="max-h-full max-w-full object-contain"
        data-testid="image-preview"
      />
    </div>
  );
}
