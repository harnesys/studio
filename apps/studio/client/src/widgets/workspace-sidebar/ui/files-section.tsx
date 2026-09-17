import { useQueries } from '@tanstack/react-query';
import { EyeIcon, FileIcon, FolderIcon, FolderOpenIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkspaces } from '@/entities/workspace';
import { knowledgeIndexStateQuery } from '@/shared/api/memory';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { ExplorerContent } from './explorer-content';
import { SectionMenu } from './section-menu';

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

export function ExplorerActions({ workspaceId }: { workspaceId: string | null }) {
  const start = useExplorerDraftStore((state) => state.start);
  const showHidden = useExplorerHiddenStore((state) => state.showHidden);
  const setShowHidden = useExplorerHiddenStore((state) => state.setShowHidden);

  return (
    <SectionMenu label="Explorer actions" contentClassName="min-w-44">
      <DropdownMenuGroup>
        <DropdownMenuItem
          disabled={!workspaceId}
          onClick={() => {
            if (workspaceId) {
              start('file', '', workspaceId);
            }
          }}
        >
          <FileIcon className="size-3" />
          New file
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!workspaceId}
          onClick={() => {
            if (workspaceId) {
              start('dir', '', workspaceId);
            }
          }}
        >
          <FolderIcon className="size-3" />
          New folder
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuCheckboxItem checked={showHidden} onCheckedChange={setShowHidden}>
          <EyeIcon className="size-3" />
          Show hidden files
        </DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
    </SectionMenu>
  );
}

export function ExplorerTrees({ workspaceIds }: { workspaceIds: string[] }) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(() => new Set(workspaceIds));

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
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-sidebar-accent/70 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={() => {
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
                {workspace.name}
              </span>
            </button>
            {open ? <ExplorerContent workspaceId={id} depthOffset={1} /> : null}
          </div>
        );
      })}
    </div>
  );
}
