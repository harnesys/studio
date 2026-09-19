import type { GitFileStatus, GitFileStatusMap, WorkspaceFileEntry } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  ScanSearchIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import type { ExplorerCreateDraft } from '../model/explorer-draft.store';
import { childrenOf } from '../model/file-tree-index';
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
  treeIndex,
  showHidden,
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
  treeIndex: Map<string, WorkspaceFileEntry[]>;
  showHidden: boolean;
  onToggle: (fullPath: string) => void;
  onSelect: (fullPath: string, event?: React.MouseEvent) => void;
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
  const children = isDir ? childrenOf(treeIndex, fullPath, showHidden) : [];
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
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (isDir) {
      onToggle(fullPath);
    }
    onSelect(fullPath);
  };
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const paths = selected && selectedPaths.length > 0 ? selectedPaths : [fullPath];
    const roots = collapseToRoots(paths);
    setMoveDrag({ workspaceId, paths: roots });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(MOVE_DRAG_MIME, roots.join('\n'));
    event.dataTransfer.setData('text/plain', fullPath);
    const label = event.currentTarget.querySelector('[data-drag-label]');
    if (label instanceof HTMLElement) {
      const ghost = label.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-drag-label');
      ghost.style.position = 'fixed';
      ghost.style.top = '-1000px';
      ghost.style.left = '-1000px';
      ghost.style.width = 'max-content';
      ghost.style.maxWidth = '240px';
      ghost.style.pointerEvents = 'none';
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 12, Math.max(ghost.offsetHeight / 2, 1));
      requestAnimationFrame(() => {
        ghost.remove();
      });
    }
  };
  const handleDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!isDir || !drag || drag.workspaceId !== workspaceId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!canDropInto(drag.paths, fullPath)) {
      setDropState('invalid');
      event.dataTransfer.dropEffect = 'none';
      return;
    }
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
    event.stopPropagation();
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
        <div
          role="treeitem"
          tabIndex={0}
          aria-expanded={isDir ? isExpanded : undefined}
          aria-selected={selected}
          className={cn(
            'group/file relative flex items-center rounded-md hover:bg-sidebar-accent/70',
            selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
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
          onKeyDown={handleKeyDown}
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
              <span data-drag-label className="flex min-w-0 items-center gap-1.5">
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
                {!isDir ? (
                  <DropdownMenuItem onClick={() => onOpen(fullPath)}>
                    <FileIcon className="size-3.5" />
                    Open
                  </DropdownMenuItem>
                ) : null}
                {isDir ? (
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
                ) : null}
                <DropdownMenuItem onClick={() => onStartRename(fullPath)}>
                  <PenLineIcon className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void navigator.clipboard.writeText(fullPath).catch(() => undefined);
                  }}
                >
                  <ClipboardIcon className="size-3.5" />
                  Copy path
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <CopyIcon className="size-3.5" />
                  Duplicate
                  <span className="ml-auto text-[11px] text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <ScanSearchIcon className="size-3.5" />
                  Reveal in Finder
                  <span className="ml-auto text-[11px] text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <DownloadIcon className="size-3.5" />
                  Download
                  <span className="ml-auto text-[11px] text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
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
              treeIndex={treeIndex}
              showHidden={showHidden}
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
