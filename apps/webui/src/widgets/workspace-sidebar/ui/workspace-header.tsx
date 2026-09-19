import { CogIcon, EllipsisVerticalIcon, FolderPlusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspaces, workspaceAvatarClass, workspaceInitial } from '@/entities/workspace';
import { openCreateWorkspaceDialog } from '@/features/create-workspace';
import {
  seedWorkspaceSelection,
  useSelectedWorkspaceIds,
  useWorkspaceTabsStore,
} from '@/features/desk';
import { navigateAfterPark } from '@/features/ide';
import { openWorkspaceSettingsDialog } from '@/features/manage-workspace-settings';
import { WORKSPACE_TAB_CAP } from '@/shared/config/constants';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
export function WorkspaceHeader() {
  const navigate = useNavigate();
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const selected = useSelectedWorkspaceIds();
  const toggle = useWorkspaceTabsStore((state) => state.toggle);
  const add = useWorkspaceTabsStore((state) => state.add);
  const focus = useStudioLocation();
  const workspaceId = studioFocusWorkspaceId(focus);
  const [menuWorkspaceId, setMenuWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId) {
      seedWorkspaceSelection(workspaceId);
    }
  }, [workspaceId]);

  const onToggle = (id: string) => {
    const turningOff = selected.includes(id);
    toggle(id);
    if (!turningOff) {
      return;
    }
    const remaining = useWorkspaceTabsStore.getState().selected;
    if (workspaceId === id) {
      navigateAfterPark(
        (to) => {
          void navigate(to);
        },
        id,
        remaining,
      );
    }
  };

  const onDesk = workspaces.filter((item) => selected.includes(item.id));
  const strip = onDesk.slice(0, WORKSPACE_TAB_CAP);
  const stripOverflow = onDesk.slice(WORKSPACE_TAB_CAP);
  const offDesk = workspaces.filter((item) => !selected.includes(item.id));
  const freeSlots = Math.max(0, WORKSPACE_TAB_CAP - strip.length);
  const ghosts = offDesk.slice(0, freeSlots);
  const ghostsOverflow = offDesk.slice(freeSlots);
  const emptySlots = Math.max(0, WORKSPACE_TAB_CAP - strip.length - ghosts.length);
  const emptySlotIds = Array.from({ length: emptySlots }, (_, index) => `empty-slot-${index}`);

  const createWorkspace = () => {
    void openCreateWorkspaceDialog().then((created) => {
      if (created) {
        add(created.id);
      }
    });
  };

  if (workspaces.length === 0) {
    return (
      <div
        className="flex flex-col gap-1 group-data-[collapsible=icon]:items-center"
        data-testid="workspace-tabs"
      >
        <button
          type="button"
          data-testid="workspace-create-cta"
          aria-label="Create workspace"
          onClick={createWorkspace}
          className={cn(
            'flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-sidebar-border border-dashed text-muted-foreground text-xs outline-none transition-colors',
            'hover:border-sidebar-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            'group-data-[collapsible=icon]:w-8',
          )}
        >
          <PlusIcon className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Create workspace</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 group-data-[collapsible=icon]:items-center"
      data-testid="workspace-tabs"
    >
      <div className="flex flex-wrap items-center gap-1 group-data-[collapsible=icon]:flex-col">
        {strip.map((item) => {
          const menuOpen = menuWorkspaceId === item.id;
          return (
            <DropdownMenu
              key={item.id}
              open={menuOpen}
              onOpenChange={(open) => {
                setMenuWorkspaceId(open ? item.id : null);
              }}
            >
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    data-testid={`workspace-tab-${item.id}`}
                    data-active="true"
                    aria-label={`${item.name} · ${item.path}`}
                    aria-haspopup="menu"
                    title={`${item.name} · ${item.path}`}
                    onPointerDown={(event) => {
                      if (event.metaKey || event.ctrlKey) {
                        event.preventDefault();
                        setMenuWorkspaceId(null);
                        onToggle(item.id);
                      }
                    }}
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent outline-none transition-colors',
                      'hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                    )}
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
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-medium text-foreground">
                    {item.name}
                  </DropdownMenuLabel>
                  <p className="break-all px-1.5 pb-1.5 text-[11px] text-muted-foreground">
                    {item.path}
                  </p>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center"
                  onClick={() => {
                    void openWorkspaceSettingsDialog(item.id);
                  }}
                >
                  <CogIcon className="relative -top-px size-3.5" />
                  Settings…
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onToggle(item.id);
                  }}
                >
                  Remove from desk
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {ghosts.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`workspace-ghost-${item.id}`}
            aria-label={`Add ${item.name} to desk`}
            title={`${item.name} · ${item.path}`}
            onClick={() => {
              add(item.id);
            }}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border border-dashed outline-none transition-colors',
              'hover:border-sidebar-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md font-medium text-[10px] text-white opacity-50',
                workspaceAvatarClass(item.id),
              )}
            >
              {workspaceInitial(item.name)}
            </span>
          </button>
        ))}

        {emptySlotIds.map((slotId) => (
          <button
            key={slotId}
            type="button"
            data-testid={`workspace-${slotId}`}
            aria-label="Add workspace"
            title="Add workspace"
            onClick={createWorkspace}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border border-dashed text-muted-foreground outline-none transition-colors',
              'hover:border-sidebar-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            )}
          >
            <FolderPlusIcon className="size-3.5 opacity-40" />
          </button>
        ))}

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
            <EllipsisVerticalIcon className="size-4" />
            <span className="sr-only">Workspaces</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="min-w-44">
            <DropdownMenuItem onClick={createWorkspace}>
              <PlusIcon />
              New workspace…
            </DropdownMenuItem>
            {stripOverflow.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>On desk</DropdownMenuLabel>
                  {stripOverflow.map((item) => (
                    <DropdownMenuItem
                      key={`on-${item.id}`}
                      onClick={() => {
                        onToggle(item.id);
                      }}
                    >
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded-sm font-medium text-[9px] text-white',
                          workspaceAvatarClass(item.id),
                        )}
                      >
                        {workspaceInitial(item.name)}
                      </span>
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
            {ghostsOverflow.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Off desk</DropdownMenuLabel>
                  {ghostsOverflow.map((item) => (
                    <DropdownMenuItem
                      key={`off-${item.id}`}
                      onClick={() => {
                        add(item.id);
                      }}
                    >
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded-sm font-medium text-[9px] text-white',
                          workspaceAvatarClass(item.id),
                        )}
                      >
                        {workspaceInitial(item.name)}
                      </span>
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
