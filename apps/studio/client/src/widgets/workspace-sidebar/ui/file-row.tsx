import type { GitFileStatus, GitFileStatusMap, WorkspaceFileEntry } from '@harnesys/studio-shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  TrashIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  canDropInto,
  collapseToRoots,
  MOVE_DRAG_MIME,
  moveDrag,
  setMoveDrag,
} from '@/features/move-workspace-files';
import { listWorkspaceFiles } from '@/shared/api/files';
import { getGitFileStatus } from '@/shared/api/git';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
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
import { getDirAggregatedStatus } from './git-file-decorations';
import { InlineCreateInput } from './inline-create-input';

type DropState = 'valid' | 'invalid' | null;

export function FileRow({
  entry,
  parentPath,
  depth,
  workspaceId,
  expandedDirs,
  selectedPaths,
  createDraft,
  renamePath,
  iconMode,
  gitMap,
  gitTruncated,
  onToggle,
  onSelect,
  onOpen,
  onStartCreate,
  onCreateFinish,
  onStartRename,
  onRenameFinish,
  onMoveInto,
  onDelete,
}: {
  entry: WorkspaceFileEntry;
  parentPath: string;
  depth: number;
  workspaceId: string;
  expandedDirs: Set<string>;
  selectedPaths: string[];
  createDraft: ExplorerCreateDraft | null;
  renamePath: string | null;
  iconMode: boolean;
  gitMap?: GitFileStatusMap;
  gitTruncated?: boolean;
  onToggle: (fullPath: string) => void;
  onSelect: (fullPath: string, event: React.MouseEvent) => void;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onCreateFinish: (name: string) => void;
  onStartRename: (fullPath: string) => void;
  onRenameFinish: (fullPath: string, name: string) => void;
  onMoveInto: (targetDir: string, paths: string[]) => void;
  onDelete: (fullPath: string) => void;
}) {
  const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const isDir = entry.kind === 'dir';
  const isExpanded = isDir && expandedDirs.has(fullPath);
  const selected = selectedPaths.includes(fullPath);
  const qc = useQueryClient();
  const [dropState, setDropState] = useState<DropState>(null);

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
  const gitColors = useGitStatusColors((state) => state.colors);
  const gitColor = gitStatus ? gitColors[gitStatus] : undefined;
  const gitDecorationClass = gitStatus ? gitStatusColorClass(gitStatus) : undefined;

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

  const handleDragStart = (event: React.DragEvent) => {
    const paths = selected && selectedPaths.length > 0 ? selectedPaths : [fullPath];
    const roots = collapseToRoots(paths);
    setMoveDrag({ workspaceId, paths: roots });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(MOVE_DRAG_MIME, roots.join('\n'));
    event.dataTransfer.setData('text/plain', fullPath);
  };

  const handleDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!isDir || !drag || drag.workspaceId !== workspaceId) {
      return;
    }
    if (!canDropInto(drag.paths, fullPath)) {
      setDropState('invalid');
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropState('valid');
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropState(null);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    setDropState(null);
    if (!isDir) {
      return;
    }
    const drag = moveDrag();
    if (!drag || drag.workspaceId !== workspaceId || !canDropInto(drag.paths, fullPath)) {
      return;
    }
    event.preventDefault();
    setMoveDrag(null);
    onMoveInto(fullPath, drag.paths);
  };

  return (
    <>
      {renamePath === fullPath ? (
        <InlineCreateInput
          kind={isDir ? 'dir' : 'file'}
          initialValue={entry.name}
          depth={depth}
          onFinish={(name) => onRenameFinish(fullPath, name)}
        />
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: drag source and drop target for explorer file moves
        <div
          className={cn(
            'group/file relative flex items-center rounded-md hover:bg-sidebar-accent/70',
            selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
            'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center',
            dropState === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
            dropState === 'invalid' && 'cursor-not-allowed opacity-60',
          )}
          style={!iconMode ? { paddingLeft: `${depth * 12 + 1}px` } : undefined}
          data-testid={`file-${fullPath}`}
          data-selected={selected ? 'true' : 'false'}
          data-drop={dropState ?? undefined}
          data-path={fullPath}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={() => {
            setMoveDrag(null);
            setDropState(null);
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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
                  gitDecorationClass,
                )}
                style={gitColor ? { color: gitColor } : undefined}
                title={gitStatus ? `git: ${gitStatus}` : undefined}
              >
                {entry.name}
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
                  className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/file:opacity-100 data-open:opacity-100 group-data-[collapsible=icon]:hidden"
                />
              }
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
              <span className="sr-only">File actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuGroup>
                {isDir && (
                  <>
                    <DropdownMenuItem onClick={() => onStartCreate('file', fullPath)}>
                      <FileIcon className="size-3.5" />
                      New file
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStartCreate('dir', fullPath)}>
                      <FolderIcon className="size-3.5" />
                      New folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => onStartRename(fullPath)}>
                  <PenLineIcon className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  <InfoIcon className="size-3.5" />
                  Info
                  <span className="ml-auto text-[11px] text-muted-foreground">{infoLabel}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(fullPath)}>
                <TrashIcon className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

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
              renamePath={renamePath}
              iconMode={iconMode}
              gitMap={effectiveMap ?? gitMap}
              gitTruncated={gitTruncated}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpen={onOpen}
              onStartCreate={onStartCreate}
              onCreateFinish={onCreateFinish}
              onStartRename={onStartRename}
              onRenameFinish={onRenameFinish}
              onMoveInto={onMoveInto}
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
