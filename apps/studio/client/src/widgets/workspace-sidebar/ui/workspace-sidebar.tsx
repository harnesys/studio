import { BotIcon, ChevronsUpDownIcon, PlusIcon, SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  getActiveThreadId,
  setActiveThreadId,
  toClientThread,
  useThreadStore,
} from '@/entities/thread';
import { useDeleteWorkspace, useWorkspaces } from '@/entities/workspace';
import {
  confirmDeleteWorkspace,
  openCreateWorkspaceDialog,
  openEditWorkspaceDialog,
} from '@/features/create-workspace';
import {
  useDeskStore,
  useSelectedSchedule,
  useSelectedWebhook,
  useSelectSchedule,
  useSelectWebhook,
  useWorkspaceAgents,
  useWorkspaceSchedules,
  useWorkspaceWebhooks,
} from '@/features/desk';
import { useIdeStore, useIdeTabs } from '@/features/ide';
import {
  confirmDeleteAgent,
  createAgent,
  deleteAgent,
  openCreateAgentDialog,
  openEditAgentDialog,
  updateAgent,
} from '@/features/manage-agent';
import { createThreadRecord } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/shared/ui/sidebar';
import { AgentCard } from '@/widgets/agent-card';
import { FilesSection } from './files-section';
import { GitSection } from './git-section';
import { RailSection } from './rail-section';
import { SchedulesSection } from './schedules-section';
import { WebhooksSection } from './webhooks-section';

export function WorkspaceSidebar() {
  const { workspaceId, surface } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
  const agents = useWorkspaceAgents(workspaceId);
  const schedules = useWorkspaceSchedules(workspaceId);
  const webhooks = useWorkspaceWebhooks(workspaceId);
  const schedule = useSelectedSchedule();
  const webhook = useSelectedWebhook();
  const { openWorkspace, leaveWorkspace, openSettings } = useStudioNavigation();
  const openSchedule = useSelectSchedule();
  const openWebhook = useSelectWebhook();
  const { setOpenMobile } = useSidebar();
  const removeWorkspace = useDeleteWorkspace();
  const navigate = useNavigate();
  const ideForSelect = useIdeTabs(workspaceId);
  const activeAgentId =
    ideForSelect.tabs.find((t) => t.id === ideForSelect.activeId)?.agentId ?? null;

  return (
    <Sidebar collapsible="icon" data-testid="workspace-sidebar">
      <SidebarHeader className="p-2 group-data-[collapsible=icon]:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-2.5 text-left outline-none hover:bg-sidebar-accent data-open:bg-sidebar-accent group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-live/70 font-medium text-[10px] text-white">
              {workspace ? workspace.name.slice(0, 1) : 'H'}
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-between gap-0.5 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-[12px] leading-none">
                {workspace?.name ?? 'Harnesys'}
              </span>
              <span className="truncate pt-0.5 font-mono text-[10px] text-muted-foreground leading-none">
                {workspace?.path ?? 'no workspace'}
              </span>
            </span>
            <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-52" align="start" side="bottom">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {workspaces.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => openWorkspace(item.id)}>
                  {item.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  void openCreateWorkspaceDialog().then((created) => {
                    if (created) {
                      openWorkspace(created.id);
                    }
                  });
                }}
              >
                <PlusIcon />
                New workspace
              </DropdownMenuItem>
              {workspace ? (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      void openEditWorkspaceDialog(workspace);
                    }}
                  >
                    Rename / folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      void confirmDeleteWorkspace(workspace).then((confirmed) => {
                        if (!confirmed) {
                          return;
                        }
                        void removeWorkspace.mutateAsync(workspace.id).then(() => {
                          leaveWorkspace();
                        });
                      });
                    }}
                  >
                    Delete workspace
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuItem onClick={() => leaveWorkspace()}>All workspaces</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 group-data-[collapsible=icon]:overflow-y-auto">
        <RailSection
          id="agents"
          icon={<BotIcon />}
          title="Agents"
          addLabel="New agent"
          selected={surface === 'chat'}
          onHeaderClick={() => {
            if (workspaceId) {
              openWorkspace(workspaceId);
              setOpenMobile(false);
            }
          }}
          onAdd={() => {
            void openCreateAgentDialog().then(async (draft) => {
              if (!draft || !workspaceId) {
                return;
              }
              const result = await createAgent(workspaceId, draft);
              if (result) {
                useIdeStore.getState().openThread(workspaceId, result.agent.id, result.thread.id);
                await navigate(
                  studioPath.workspaceThread(workspaceId, result.agent.id, result.thread.id),
                );
              }
            });
          }}
        >
          {agents.length === 0 ? (
            <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
              No agents in this workspace yet.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
              {agents.map((item) => (
                <AgentCard
                  key={item.id}
                  agent={item}
                  selected={activeAgentId === item.id}
                  onSelect={() => {
                    if (!workspaceId) {
                      return;
                    }
                    const stored = getActiveThreadId(item.id);
                    const threads = useThreadStore.getState().forAgent(item.id);
                    const target =
                      (stored ? threads.find((t) => t.id === stored) : undefined) ??
                      useThreadStore.getState().latestForAgent(item.id);
                    if (target) {
                      useIdeStore.getState().openThread(workspaceId, item.id, target.id);
                      useDeskStore.getState().setFocusedThreadId(target.id);
                      setActiveThreadId(item.id, target.id);
                      void navigate(studioPath.workspaceThread(workspaceId, item.id, target.id));
                    } else {
                      void createThreadRecord({ workspaceId, agentId: item.id }).then((record) => {
                        const thread = toClientThread(record);
                        useThreadStore.getState().upsert(thread);
                        useIdeStore.getState().openThread(workspaceId, item.id, thread.id);
                        useDeskStore.getState().setFocusedThreadId(thread.id);
                        setActiveThreadId(item.id, thread.id);
                        void navigate(studioPath.workspaceThread(workspaceId, item.id, thread.id));
                      });
                    }
                    setOpenMobile(false);
                  }}
                  onEdit={() => {
                    void openEditAgentDialog(item).then(async (draft) => {
                      if (!draft || !workspaceId) {
                        return;
                      }
                      await updateAgent(workspaceId, item.id, draft);
                    });
                  }}
                  onDelete={() => {
                    void confirmDeleteAgent(item).then(async (confirmed) => {
                      if (!confirmed || !workspaceId) {
                        return;
                      }
                      await deleteAgent(workspaceId, item.id);
                    });
                  }}
                />
              ))}
            </div>
          )}
        </RailSection>

        <SchedulesSection
          workspaceId={workspaceId}
          agents={agents}
          schedules={schedules}
          selectedScheduleId={schedule?.id ?? null}
          selected={surface === 'schedules'}
          onOpen={openSchedule}
          onSelectDone={() => setOpenMobile(false)}
        />

        <WebhooksSection
          workspaceId={workspaceId}
          agents={agents}
          webhooks={webhooks}
          selectedWebhookId={webhook?.id ?? null}
          selected={surface === 'webhooks'}
          onOpen={openWebhook}
          onSelectDone={() => setOpenMobile(false)}
        />

        {workspaceId && <FilesSection workspaceId={workspaceId} selected={surface === 'files'} />}
      </SidebarContent>

      {workspaceId ? (
        <div className="p-2">
          <GitSection workspaceId={workspaceId} />
        </div>
      ) : null}
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                openSettings();
                setOpenMobile(false);
              }}
              tooltip="Settings"
              data-testid="nav-settings"
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
