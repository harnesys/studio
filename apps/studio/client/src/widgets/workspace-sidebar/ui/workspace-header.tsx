import { EllipsisIcon, PlusIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useWorkspaces, workspaceAvatarClass, workspaceInitial } from '@/entities/workspace';
import { openCreateWorkspaceDialog } from '@/features/create-workspace';
import { WORKSPACE_TAB_CAP } from '@/shared/config/constants';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  seedWorkspaceSelection,
  useSelectedWorkspaceIds,
  useWorkspaceTabsStore,
} from '../model/workspace-tabs.store';

export function WorkspaceHeader() {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const selected = useSelectedWorkspaceIds();
  const toggle = useWorkspaceTabsStore((state) => state.toggle);
  const add = useWorkspaceTabsStore((state) => state.add);
  const { workspaceId } = useStudioLocation();
  const { openWorkspace } = useStudioNavigation();

  useEffect(() => {
    if (workspaceId) {
      seedWorkspaceSelection(workspaceId);
    }
  }, [workspaceId]);

  const tabs = workspaces.slice(0, WORKSPACE_TAB_CAP);
  const overflow = workspaces.slice(WORKSPACE_TAB_CAP);

  return (
    <div className="flex items-center gap-1" data-testid="workspace-tabs">
      {tabs.map((item) => {
        const active = selected.includes(item.id);
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  data-testid={`workspace-tab-${item.id}`}
                  data-active={active ? 'true' : 'false'}
                  aria-label={`${item.name} · ${item.path}`}
                  onClick={() => {
                    toggle(item.id);
                  }}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:border-sidebar-border data-[active=true]:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
                />
              }
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-md font-medium text-[10px] text-white',
                  workspaceAvatarClass(item.id),
                )}
              >
                {workspaceInitial(item.name)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {item.name} · {item.path}
            </TooltipContent>
          </Tooltip>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Workspaces"
              data-testid="workspace-tabs-menu"
              className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground group-data-[collapsible=icon]:ml-0"
            />
          }
        >
          <EllipsisIcon className="size-4" />
          <span className="sr-only">Workspaces</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="min-w-44">
          <DropdownMenuItem
            onClick={() => {
              void openCreateWorkspaceDialog().then((created) => {
                if (created) {
                  add(created.id);
                  openWorkspace(created.id);
                }
              });
            }}
          >
            <PlusIcon />
            New workspace
          </DropdownMenuItem>
          {overflow.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>More workspaces</DropdownMenuLabel>
              {overflow.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => toggle(item.id)}>
                  {item.name}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
