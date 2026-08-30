import type { GitFileStatus } from '@studio/shared';
import { FileIcon, FilePlusIcon, FileXIcon, PencilIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { ScrollArea } from '@/shared/ui/scroll-area';

type FileEntry = {
  path: string;
  status: GitFileStatus;
};

export function GitCommitFileList({
  files,
  selectedPath,
  onSelect,
  isLoading,
}: {
  files: FileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <div className="p-3 text-muted-foreground text-xs">Loading changes…</div>;
  }

  if (files.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">No changes to commit</div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-1">
        <div className="mb-1 px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wide">
          Changes · {files.length}
        </div>
        <ul className="flex flex-col gap-0.5">
          {files.map((file) => {
            const active = file.path === selectedPath;
            return (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => onSelect(file.path)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center',
                      statusColor(file.status),
                    )}
                  >
                    <StatusIcon status={file.status} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{file.path}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1 py-0.5 font-mono text-[10px] uppercase',
                      badgeColor(file.status),
                    )}
                  >
                    {statusLabel(file.status)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ScrollArea>
  );
}

function StatusIcon({ status }: { status: GitFileStatus }) {
  if (status === 'added' || status === 'untracked') {
    return <FilePlusIcon className="size-3" />;
  }
  if (status === 'deleted') {
    return <FileXIcon className="size-3" />;
  }
  if (status === 'modified' || status === 'staged') {
    return <PencilIcon className="size-3" />;
  }
  return <FileIcon className="size-3" />;
}

function statusColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-emerald-500';
    case 'deleted':
      return 'text-muted-foreground';
    case 'modified':
      return 'text-amber-500';
    case 'staged':
      return 'text-emerald-500';
    case 'conflicted':
      return 'text-destructive';
    case 'renamed':
      return 'text-sky-500';
    default:
      return 'text-muted-foreground';
  }
}

function badgeColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
      return 'bg-emerald-500/15 text-emerald-600';
    case 'untracked':
      return 'bg-red-500/15 text-red-600';
    case 'modified':
      return 'bg-amber-500/15 text-amber-600';
    case 'deleted':
      return 'bg-muted text-muted-foreground line-through';
    case 'staged':
      return 'bg-emerald-500/15 text-emerald-600';
    case 'conflicted':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function statusLabel(status: GitFileStatus): string {
  if (status === 'untracked') {
    return 'U';
  }
  if (status === 'modified') {
    return 'M';
  }
  if (status === 'added') {
    return 'A';
  }
  if (status === 'deleted') {
    return 'D';
  }
  if (status === 'staged') {
    return 'S';
  }
  if (status === 'conflicted') {
    return 'C';
  }
  if (status === 'renamed') {
    return 'R';
  }
  return status.slice(0, 1).toUpperCase();
}
