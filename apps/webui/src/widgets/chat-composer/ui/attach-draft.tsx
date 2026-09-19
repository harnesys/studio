import { useEffect, useState } from 'react';

import { FileChip } from '@/shared/ui/file-chip';

export function AttachDraft({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {files.map((file, index) => (
        <DraftChip
          key={`${file.name}:${file.size}:${file.lastModified}`}
          file={file}
          onRemove={() => onRemove(index)}
        />
      ))}
    </div>
  );
}

function DraftChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const preview = useObjectUrl(file.type.startsWith('image/') ? file : null);
  return (
    <FileChip
      name={file.name}
      mediaType={file.type}
      bytes={file.size}
      previewUrl={preview ?? undefined}
      onRemove={onRemove}
    />
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
