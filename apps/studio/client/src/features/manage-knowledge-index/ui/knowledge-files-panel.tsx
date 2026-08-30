import type { KnowledgeFileRecord, KnowledgeFileStatus } from '@studio/shared';

import { Badge } from '@/shared/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

const FILE_FILTERS = [
  'indexed',
  'skipped',
  'error',
  'pending',
] as const satisfies readonly KnowledgeFileStatus[];

const FILTER_LABELS: Record<KnowledgeFileStatus, string> = {
  indexed: 'Indexed',
  skipped: 'Skipped',
  error: 'Error',
  pending: 'Pending',
};

type KnowledgeFilesPanelProps = {
  status: KnowledgeFileStatus;
  onStatusChange: (status: KnowledgeFileStatus) => void;
  files: KnowledgeFileRecord[];
  loading?: boolean;
};

export function KnowledgeFilesPanel({
  status,
  onStatusChange,
  files,
  loading,
}: KnowledgeFilesPanelProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="knowledge-files-panel">
      <div className="flex h-8 items-center gap-2">
        <p className="font-medium text-sm">Files</p>
        <ToggleGroup
          className="ml-auto"
          variant="outline"
          spacing={0}
          value={[status]}
          onValueChange={(value) => {
            const next = value[0];
            if (isFileStatus(next)) {
              onStatusChange(next);
            }
          }}
        >
          {FILE_FILTERS.map((item) => (
            <ToggleGroupItem key={item} value={item} className="min-w-[64px] px-2 text-xs">
              {FILTER_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Loading files…</p> : null}
      {!loading && files.length === 0 ? (
        <Empty className="min-h-0 border-0 py-6">
          <EmptyHeader>
            <EmptyTitle>No {FILTER_LABELS[status].toLowerCase()} files</EmptyTitle>
            <EmptyDescription>Run reindex to populate the inventory.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {!loading && files.length > 0 ? (
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {files.map((file) => (
            <div
              key={file.uri}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/50"
              data-testid={`knowledge-file-${file.uri}`}
              title={file.lastError ?? file.skipReason ?? undefined}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
                <FileTypeIcon name={file.uri} className="opacity-70" />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs leading-4">
                {file.uri}
              </span>
              {file.skipReason || file.lastError ? (
                <span className="max-w-[40%] truncate text-[11px] text-muted-foreground">
                  {file.lastError ?? file.skipReason}
                </span>
              ) : null}
              <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px] leading-none">
                {file.chunkCount}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isFileStatus(value: string | undefined): value is KnowledgeFileStatus {
  return value === 'indexed' || value === 'skipped' || value === 'error' || value === 'pending';
}
