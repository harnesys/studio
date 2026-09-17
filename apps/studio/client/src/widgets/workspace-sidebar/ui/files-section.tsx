import { useQueries } from '@tanstack/react-query';
import {
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  ScanSearchIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkspaces } from '@/entities/workspace';
import {
  buildMoveItems,
  canDropInto,
  moveDrag,
  setMoveDrag,
  useMoveWorkspaceFiles,
} from '@/features/move-workspace-files';
import { knowledgeIndexStateQuery } from '@/shared/api/memory';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { ExplorerContent } from './explorer-content';
import { SectionMenu } from './section-menu';

type RootDropState = 'valid' | 'invalid' | null;

export function ExplorerTitle({ workspaceIds }: { workspaceIds: string[] }) {
  const indexQueries = useQueries({
    queries: workspaceIds.map((workspaceId) => ({
      ...knowledgeIndexStateQuery(workspaceId),
      enabled: Boolean(workspaceId),
    })),
  });
  const isIndexing = indexQueries.some((query) => query.data?.status === 'running');

  return (
    <span className="flex items-center gap-1.5">
      Explorer
      {isIndexing ? (
        <LoaderCircleIcon
          className="size-3.5 animate-spin text-muted-foreground"
          data-testid="files-indexing"
          aria-label="Indexing"
        />
      ) : null}
    </span>
  );
}

export function ExplorerActions() {
  const showHidden = useExplorerHiddenStore((state) => state.showHidden);
  const setShowHidden = useExplorerHiddenStore((state) => state.setShowHidden);

  return (
    <SectionMenu label="Explorer actions" contentClassName="min-w-44">
      <DropdownMenuGroup>
        <DropdownMenuCheckboxItem checked={showHidden} onCheckedChange={setShowHidden}>
          {showHidden ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
          {showHidden ? 'Hide hidden files' : 'Show hidden files'}
        </DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
    </SectionMenu>
  );
}

export function ExplorerFolderMenu({
  workspaceId,
  dirPath,
}: {
  workspaceId: string;
  /** Empty string = workspace root. */
  dirPath: string;
}) {
  const start = useExplorerDraftStore((state) => state.start);
  const label = dirPath || 'workspace root';

  const copyPath = async () => {
    const text = dirPath || '.';
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: 'Path copied' });
    } catch {
      toast.add({ title: 'Could not copy path' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Folder actions · ${label}`}
            className="opacity-0 group-hover/file:opacity-100 group-hover/ws:opacity-100 data-open:opacity-100"
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">Folder actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => start('file', dirPath, workspaceId)}>
            <FileIcon className="size-3.5" />
            New file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => start('dir', dirPath, workspaceId)}>
            <FolderIcon className="size-3.5" />
            New folder
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void copyPath()}>
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function canMoveToWorkspaceRoot(paths: string[]): boolean {
  return canDropInto(paths, '') && buildMoveItems(paths, '').length > 0;
}

function ExplorerWorkspaceRoot({
  workspaceId,
  name,
  multi,
  open,
  onToggle,
}: {
  workspaceId: string;
  name: string;
  multi: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const moveMutation = useMoveWorkspaceFiles(workspaceId);
  const [dropState, setDropState] = useState<RootDropState>(null);

  const handleDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || drag.workspaceId !== workspaceId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!canMoveToWorkspaceRoot(drag.paths)) {
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
    const drag = moveDrag();
    if (!drag || drag.workspaceId !== workspaceId || !canMoveToWorkspaceRoot(drag.paths)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setMoveDrag(null);
    const items = buildMoveItems(drag.paths, '');
    if (items.length > 0) {
      moveMutation.mutate(items);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: workspace catalog row is a drop target for moves to root
    <div
      className={cn(
        'group/ws relative flex items-center rounded-md hover:bg-sidebar-accent/70',
        'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center',
        dropState === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
        dropState === 'invalid' && 'cursor-not-allowed opacity-60',
      )}
      data-drop={dropState ?? undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left',
          multi ? 'text-[10px] text-muted-foreground uppercase tracking-[0.04em]' : 'text-xs',
        )}
        onClick={onToggle}
      >
        {open ? (
          <FolderOpenIcon className="size-3.5 shrink-0 text-live/70" />
        ) : (
          <FolderIcon className="size-3.5 shrink-0 text-live/70" />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-medium',
            'group-data-[collapsible=icon]:hidden',
          )}
        >
          {name}
        </span>
      </button>
      <span className="absolute top-1/2 right-1 -translate-y-1/2 group-data-[collapsible=icon]:hidden">
        <ExplorerFolderMenu workspaceId={workspaceId} dirPath="" />
      </span>
    </div>
  );
}

export function ExplorerTrees({ workspaceIds }: { workspaceIds: string[] }) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(() => new Set(workspaceIds));
  const multi = workspaceIds.length > 1;

  useEffect(() => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      for (const id of workspaceIds) {
        next.add(id);
      }
      for (const id of next) {
        if (!workspaceIds.includes(id)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [workspaceIds]);

  if (workspaceIds.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No workspace selected.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {workspaceIds.map((id) => {
        const workspace = workspaces.find((item) => item.id === id);
        if (!workspace) {
          return null;
        }
        const open = expandedRoots.has(id);
        return (
          <div key={id} data-testid={`explorer-workspace-${id}`}>
            <ExplorerWorkspaceRoot
              workspaceId={id}
              name={workspace.name}
              multi={multi}
              open={open}
              onToggle={() => {
                setExpandedRoots((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  return next;
                });
              }}
            />
            {open ? <ExplorerContent workspaceId={id} depthOffset={1} /> : null}
          </div>
        );
      })}
    </div>
  );
}
