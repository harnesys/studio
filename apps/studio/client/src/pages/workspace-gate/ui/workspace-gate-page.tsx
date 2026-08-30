import { MoreHorizontalIcon } from 'lucide-react';
import { useDeleteWorkspace, useWorkspaces, type Workspace } from '@/entities/workspace';
import {
  confirmDeleteWorkspace,
  openCreateWorkspaceDialog,
  openEditWorkspaceDialog,
} from '@/features/create-workspace';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/shared/ui/item';
import { Skeleton } from '@/shared/ui/skeleton';

export function WorkspaceGatePage() {
  const { data: workspaces = [], status: workspacesStatus } = useWorkspaces();
  const { openWorkspace } = useStudioNavigation();
  const remove = useDeleteWorkspace();

  let workspaceList = null;
  if (workspacesStatus === 'pending') {
    workspaceList = (
      <div className="fade-in flex animate-in flex-col gap-2 py-1 duration-200">
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 p-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 p-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    );
  } else if (workspacesStatus === 'error') {
    workspaceList = <p className="text-destructive text-sm">Could not load workspaces.</p>;
  } else if (workspaces.length === 0) {
    workspaceList = <p className="text-muted-foreground text-sm">No workspaces yet.</p>;
  } else {
    workspaceList = workspaces.map((workspace) => (
      <WorkspaceRow
        key={workspace.id}
        workspace={workspace}
        onSelect={() => openWorkspace(workspace.id)}
        onEdit={() => {
          void openEditWorkspaceDialog(workspace);
        }}
        onDelete={() => {
          void confirmDeleteWorkspace(workspace).then((confirmed) => {
            if (confirmed) {
              void remove.mutateAsync(workspace.id);
            }
          });
        }}
      />
    ));
  }

  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background p-6"
      data-testid="workspace-gate"
    >
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
            Harnesys
          </p>
          <h1 className="font-medium text-xl tracking-tight">Open a workspace</h1>
          <p className="text-muted-foreground text-sm">
            Agents, threads, schedules, and webhooks for a folder on this machine.
          </p>
        </div>
        <ItemGroup className="gap-1" data-testid="workspace-picker">
          {workspaceList}
        </ItemGroup>
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            onClick={() => {
              void openCreateWorkspaceDialog().then((created) => {
                if (created) {
                  openWorkspace(created.id);
                }
              });
            }}
          >
            Create workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceRow({
  workspace,
  onSelect,
  onEdit,
  onDelete,
}: {
  workspace: Workspace;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Item
      variant="outline"
      size="sm"
      className="cursor-pointer items-start"
      data-testid={`workspace-option-${workspace.id}`}
      onClick={onSelect}
    >
      <ItemContent>
        <ItemTitle>{workspace.name}</ItemTitle>
        <ItemDescription className="font-mono">{workspace.path}</ItemDescription>
      </ItemContent>
      <ItemActions
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${workspace.name}`} />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Rename / folder</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}
