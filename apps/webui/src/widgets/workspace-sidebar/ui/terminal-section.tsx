import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, PlusIcon, SquareTerminalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspaces } from '@/entities/workspace';
import { useIdeStore, useOpenTerminalTab } from '@/features/ide';
import {
  createTerminal,
  deleteTerminal,
  listTerminals,
  type TerminalSessionRecord,
  terminalsQueryKey,
} from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { WorkspaceGroupLabel } from './workspace-group';
export function TerminalSectionActions({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated?: () => void;
}) {
  const openTerminalTab = useOpenTerminalTab();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => createTerminal(workspaceId),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: terminalsQueryKey(workspaceId) });
      openTerminalTab(workspaceId, session.id);
      onCreated?.();
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to create terminal',
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New terminal"
      aria-label="New terminal"
      data-testid={`terminals-create-${workspaceId}`}
      disabled={create.isPending}
      onClick={() => create.mutate()}
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New terminal</span>
    </Button>
  );
}
export function TerminalSection({
  workspaceIds,
  activeSessionId,
  onSelectDone,
  groupActions,
}: {
  workspaceIds: string[];
  activeSessionId: string | null;
  onSelectDone?: () => void;
  groupActions?: (workspaceId: string) => ReactNode;
}) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  if (workspaceIds.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No workspace selected.
      </p>
    );
  }
  const multi = workspaceIds.length > 1;
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
      {workspaceIds.map((id) => {
        const workspace = workspaces.find((item) => item.id === id);
        if (!workspace) {
          return null;
        }
        return (
          <TerminalWorkspaceGroup
            key={id}
            workspaceId={id}
            workspaceName={workspace.name}
            showHeader={multi}
            activeSessionId={activeSessionId}
            onSelectDone={onSelectDone}
            actions={multi ? groupActions?.(id) : undefined}
          />
        );
      })}
    </div>
  );
}
function TerminalWorkspaceGroup({
  workspaceId,
  workspaceName,
  showHeader,
  activeSessionId,
  onSelectDone,
  actions,
}: {
  workspaceId: string;
  workspaceName: string;
  showHeader: boolean;
  activeSessionId: string | null;
  onSelectDone?: () => void;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const openTerminalTab = useOpenTerminalTab();
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: terminalsQueryKey(workspaceId),
    queryFn: () => listTerminals(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 5000,
  });
  const sessions = sessionsQuery.data ?? [];
  const remove = useMutation({
    mutationFn: (sessionId: string) => deleteTerminal(workspaceId, sessionId),
    onSuccess: (_void, sessionId) => {
      useIdeStore.getState().closeByEntity(workspaceId, 'terminal', sessionId);
      void queryClient.invalidateQueries({ queryKey: terminalsQueryKey(workspaceId) });
      if (activeSessionId === sessionId) {
        void navigate(studioPath.desk);
      }
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to delete terminal',
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
  return (
    <div data-testid={`terminals-workspace-${workspaceId}`}>
      {showHeader ? <WorkspaceGroupLabel name={workspaceName} visible actions={actions} /> : null}
      {sessions.length === 0 && !sessionsQuery.isPending ? (
        <p className="px-2 py-2 text-muted-foreground text-xs">No terminals.</p>
      ) : null}
      {sessions.map((session) => (
        <TerminalRow
          key={session.id}
          session={session}
          selected={activeSessionId === session.id}
          onSelect={() => {
            openTerminalTab(workspaceId, session.id);
            onSelectDone?.();
          }}
          onDelete={() => remove.mutate(session.id)}
        />
      ))}
    </div>
  );
}
function TerminalRow({
  session,
  selected,
  onSelect,
  onDelete,
}: {
  session: TerminalSessionRecord;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'group/term relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
      )}
      data-testid={`terminal-${session.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        onClick={onSelect}
      >
        <SquareTerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm leading-4">{session.title}</span>
        {session.exited ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">exited</span>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/term:opacity-100 data-open:opacity-100"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">Terminal actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Kill terminal
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
