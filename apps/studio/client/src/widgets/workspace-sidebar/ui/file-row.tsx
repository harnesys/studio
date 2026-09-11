import type { GitFileStatus, GitFileStatusMap, WorkspaceFileEntry } from '@harnesys/studio-shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  MoreHorizontalIcon,
  TrashIcon,
} from 'lucide-react';
import { listWorkspaceFiles } from '@/shared/api/files';
import { getGitFileStatus } from '@/shared/api/git';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';
import { Spinner } from '@/shared/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import type { ExplorerCreateDraft } from '../model/explorer-draft.store';
import { getDirAggregatedStatus, gitStatusColor } from './git-file-decorations';
import { InlineCreateInput } from './inline-create-input';

export function FileRow({
  entry,
  parentPath,
  depth,
  workspaceId,
  expandedDirs,
  selectedPaths,
  createDraft,
  iconMode,
  gitMap,
  gitTruncated,
  onToggle,
  onSelect,
  onOpen,
  onStartCreate,
  onCreateFinish,
  onDelete,
}: {
  entry: WorkspaceFileEntry;
  parentPath: string;
  depth: number;
  workspaceId: string;
  expandedDirs: Set<string>;
  selectedPaths: string[];
  createDraft: ExplorerCreateDraft | null;
  iconMode: boolean;
  gitMap?: GitFileStatusMap;
  gitTruncated?: boolean;
  onToggle: (fullPath: string) => void;
  onSelect: (fullPath: string, event: React.MouseEvent) => void;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onCreateFinish: (name: string) => void;
  onDelete: (fullPath: string) => void;
}) {
  const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const isDir = entry.kind === 'dir';
  const isExpanded = isDir && expandedDirs.has(fullPath);
  const selected = selectedPaths.includes(fullPath);
  const qc = useQueryClient();

  const dirGitQuery = useQuery({
    queryKey: ['workspaces', workspaceId, 'git', 'file-status', fullPath],
    queryFn: () => getGitFileStatus(workspaceId, fullPath),
    enabled: Boolean(gitTruncated && isDir && isExpanded),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  let effectiveMap: GitFileStatusMap | undefined;
  if (gitTruncated) {
    if (isDir && isExpanded) {
      effectiveMap = dirGitQuery.data?.map;
    } else {
      effectiveMap = undefined;
    }
  } else {
    effectiveMap = gitMap;
  }

  const fileGitStatus: GitFileStatus | undefined = !isDir ? effectiveMap?.[fullPath] : undefined;
  const dirAggregated: GitFileStatus | undefined = isDir
    ? getDirAggregatedStatus(fullPath, effectiveMap ?? gitMap)
    : undefined;
  const gitStatus: GitFileStatus | undefined = isDir ? dirAggregated : fileGitStatus;
  const gitColor = gitStatus ? gitStatusColor(gitStatus) : undefined;

  const childrenQuery = useQuery({
    queryKey: ['workspace-files', workspaceId, fullPath],
    queryFn: () => listWorkspaceFiles(workspaceId, fullPath),
    enabled: isDir && isExpanded,
    placeholderData: keepPreviousData,
  });

  const children = isDir ? (childrenQuery.data ?? []) : [];
  let infoLabel = '';
  if (isDir) {
    infoLabel = `${children.length} items`;
  } else if (entry.size !== undefined) {
    infoLabel = formatSize(entry.size);
  }

  const showCreateHere = createDraft && isDir && createDraft.parentPath === fullPath;

  const handleClick = (event: React.MouseEvent) => {
    const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
    if (isDir) {
      if (hasModifier) {
        onSelect(fullPath, event);
        return;
      }
      if (!isExpanded) {
        void qc.prefetchQuery({
          queryKey: ['workspace-files', workspaceId, fullPath],
          queryFn: () => listWorkspaceFiles(workspaceId, fullPath),
        });
      }
      onToggle(fullPath);
      onSelect(fullPath, event);
    } else {
      onSelect(fullPath, event);
    }
  };

  const handleDoubleClick = () => {
    if (!isDir) {
      onOpen(fullPath);
    }
  };

  return (
    <>
      <div
        className={cn(
          'group/file relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
          selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
          'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center',
        )}
        style={!iconMode ? { paddingLeft: `${depth * 12 + 1}px` } : undefined}
        data-testid={`file-${fullPath}`}
        data-selected={selected ? 'true' : 'false'}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 pl-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              />
            }
          >
            {isDir ? (
              <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
                {isExpanded ? (
                  <FolderOpenIcon className="text-live/70" />
                ) : (
                  <FolderIcon className="text-live/70" />
                )}
              </span>
            ) : (
              <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
                <FileTypeIcon name={entry.name} className="opacity-70 saturate-60" />
              </span>
            )}
            <span
              className={cn(
                'min-w-0 truncate text-sm leading-4 group-data-[collapsible=icon]:hidden',
                selected ? 'text-sidebar-foreground/90' : 'text-sidebar-foreground/70',
                gitColor,
              )}
              title={gitStatus ? `git: ${gitStatus}` : undefined}
            >
              {entry.name}
              {gitStatus ? (
                <span className="ml-1 text-[11px] opacity-70">• {gitStatus[0]?.toUpperCase()}</span>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={!iconMode}>
            {fullPath}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 group-hover/file:opacity-100 group-data-[collapsible=icon]:hidden"
              />
            }
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">File actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuGroup>
              {isDir && (
                <>
                  <DropdownMenuItem onClick={() => onStartCreate('file', fullPath)}>
                    <FileIcon />
                    New file
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStartCreate('dir', fullPath)}>
                    <FolderIcon />
                    New folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => {}}>
                <InfoIcon />
                Info
                <span className="ml-auto text-[11px] text-muted-foreground">{infoLabel}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(fullPath)}>
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isDir && isExpanded && (
        <div className="flex flex-col">
          {childrenQuery.isFetching && children.length === 0 && (
            <div className="flex items-center gap-1.5 px-1.5 py-1 pl-6 text-muted-foreground group-data-[collapsible=icon]:hidden">
              <Spinner className="size-3" />
              <span className="text-xs">Loading...</span>
            </div>
          )}
          {children.map((child) => (
            <FileRow
              key={child.name}
              entry={child}
              parentPath={fullPath}
              depth={depth + 1}
              workspaceId={workspaceId}
              expandedDirs={expandedDirs}
              selectedPaths={selectedPaths}
              createDraft={createDraft}
              iconMode={iconMode}
              gitMap={effectiveMap ?? gitMap}
              gitTruncated={gitTruncated}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpen={onOpen}
              onStartCreate={onStartCreate}
              onCreateFinish={onCreateFinish}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {showCreateHere && (
        <InlineCreateInput kind={createDraft.kind} onFinish={onCreateFinish} depth={depth + 1} />
      )}
    </>
  );
}

export { InlineCreateInput } from './inline-create-input';

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
