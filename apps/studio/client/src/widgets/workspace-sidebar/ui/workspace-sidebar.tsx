import {
  ChevronsUpDownIcon,
  CpuIcon,
  FolderIcon,
  GitBranchIcon,
  PlusIcon,
  SettingsIcon,
  ZapIcon,
} from 'lucide-react';
import { type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import { useThreadStore } from '@/entities/thread';
import { useDeleteWorkspace, useWorkspaces } from '@/entities/workspace';
import {
  confirmDeleteWorkspace,
  openCreateWorkspaceDialog,
  openEditWorkspaceDialog,
} from '@/features/create-workspace';
import {
  useAgentsSlideStore,
  useAgentThreads,
  useWorkspaceAgents,
  useWorkspaceSchedules,
  useWorkspaceWebhooks,
} from '@/features/desk';
import { useIdeTabs } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Resizer } from '@/shared/ui/resizer';
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
import { normalizeShares, useAccordionStore } from '../model/accordion.store';
import { AccordionSection } from './accordion-section';
import { AgentsSection, AgentsSectionActions } from './agents-section';
import { AutomationsAddMenu, AutomationsSection } from './automations-section';
import { ExplorerActions, ExplorerContent, ExplorerTitle } from './files-section';
import { GitSectionMenu, GitTitle } from './git-menu';
import { GitSection } from './git-section';

type SidebarSectionId = 'agents' | 'explorer' | 'automations' | 'git';

const SECTION_ORDER: SidebarSectionId[] = ['agents', 'explorer', 'automations', 'git'];

export function WorkspaceSidebar() {
  const { workspaceId, threadId, threadOrigin, originEntityId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
  const agents = useWorkspaceAgents(workspaceId);
  const schedules = useWorkspaceSchedules(workspaceId);
  const webhooks = useWorkspaceWebhooks(workspaceId);
  const { openWorkspace, leaveWorkspace, openSettings } = useStudioNavigation();
  const { setOpenMobile } = useSidebar();
  const removeWorkspace = useDeleteWorkspace();
  const ideTabs = useIdeTabs(workspaceId);
  const activeThreadId = ideTabs.tabs.find((tab) => tab.id === ideTabs.activeId)?.threadId ?? null;
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  const slideAgent = agents.find((item) => item.id === slideAgentId) ?? null;
  const slideThreads = useAgentThreads(slideAgent?.id ?? null);
  const threadAgentId = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.agentId ?? null) : null,
  );
  let activeAgentId: string | null = threadAgentId;
  if (threadOrigin === 'agent') {
    activeAgentId = originEntityId;
  }
  if (slideAgentId) {
    activeAgentId = slideAgentId;
  }
  const activeScheduleId = threadOrigin === 'scheduler' ? originEntityId : null;
  const activeWebhookId = threadOrigin === 'webhook' ? originEntityId : null;
  const collapsed = useAccordionStore((state) => state.collapsed);
  const sizes = useAccordionStore((state) => state.sizes);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPair, setDragPair] = useState<string | null>(null);

  const expanded = SECTION_ORDER.filter((id) => !(collapsed[id] ?? false));
  const shares = normalizeShares(expanded, sizes);

  const resizePairs: { upper: SidebarSectionId; lower: SidebarSectionId }[] = [];
  let lastExpanded: SidebarSectionId | null = null;
  for (const id of expanded) {
    if (lastExpanded) {
      resizePairs.push({ upper: lastExpanded, lower: id });
    }
    lastExpanded = id;
  }
  const pairBefore = (id: SidebarSectionId) =>
    resizePairs.find((pair) => pair.lower === id) ?? null;

  const resizeNode = (id: SidebarSectionId) => {
    const pair = pairBefore(id);
    if (!pair) {
      return null;
    }
    const key = `${pair.upper}:${pair.lower}`;
    return (
      <Resizer
        key={key}
        label={`Resize ${pair.upper} and ${pair.lower}`}
        testId={`accordion-resize-${pair.upper}-${pair.lower}`}
        dragging={dragPair === key}
        orientation="vertical"
        onResizeStart={beginResize(pair.upper, pair.lower)}
      />
    );
  };

  const beginResize =
    (upperId: SidebarSectionId, lowerId: SidebarSectionId) => (event: ReactMouseEvent) => {
      event.preventDefault();
      const root = containerRef.current;
      const upper = root?.querySelector(`[data-accordion-content="${upperId}"]`);
      const lower = root?.querySelector(`[data-accordion-content="${lowerId}"]`);
      if (!upper || !lower) {
        return;
      }
      const upperPx = upper.getBoundingClientRect().height;
      const lowerPx = lower.getBoundingClientRect().height;
      const totalPx = upperPx + lowerPx;
      if (totalPx <= 0) {
        return;
      }
      const startY = event.clientY;
      setDragPair(`${upperId}:${lowerId}`);
      const onMove = (moveEvent: MouseEvent) => {
        const current = useAccordionStore.getState().sizes;
        const pairSum = (current[upperId] ?? 1) + (current[lowerId] ?? 1);
        const ratio = Math.min(1, Math.max(0, (upperPx + moveEvent.clientY - startY) / totalPx));
        useAccordionStore
          .getState()
          .setSizes({ ...current, [upperId]: pairSum * ratio, [lowerId]: pairSum * (1 - ratio) });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setDragPair(null);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

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
        <div ref={containerRef} className="flex min-h-0 flex-auto flex-col gap-1 px-2 pb-2">
          <AccordionSection
            id="agents"
            icon={<CpuIcon />}
            title={slideAgent ? `Threads · ${slideAgent.name}` : 'Agents'}
            count={
              slideAgent ? slideThreads.length : agents.filter((agent) => !agent.parentId).length
            }
            size={shares.agents ?? 1}
            actions={<AgentsSectionActions workspaceId={workspaceId} />}
          >
            <AgentsSection
              workspaceId={workspaceId}
              agents={agents}
              activeAgentId={activeAgentId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
            />
          </AccordionSection>

          {resizeNode('explorer')}
          <AccordionSection
            id="explorer"
            icon={<FolderIcon />}
            title={workspaceId ? <ExplorerTitle workspaceId={workspaceId} /> : 'Explorer'}
            size={shares.explorer ?? 1}
            actions={workspaceId ? <ExplorerActions /> : undefined}
          >
            {workspaceId ? <ExplorerContent workspaceId={workspaceId} /> : null}
          </AccordionSection>

          {resizeNode('automations')}
          <AccordionSection
            id="automations"
            icon={<ZapIcon />}
            title="Automations"
            count={schedules.length + webhooks.length}
            size={shares.automations ?? 1}
            actions={
              <AutomationsAddMenu
                workspaceId={workspaceId}
                agents={agents}
                onDone={() => setOpenMobile(false)}
              />
            }
          >
            <AutomationsSection
              workspaceId={workspaceId}
              agents={agents}
              schedules={schedules}
              webhooks={webhooks}
              activeScheduleId={activeScheduleId}
              activeWebhookId={activeWebhookId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
            />
          </AccordionSection>

          {resizeNode('git')}
          <AccordionSection
            id="git"
            icon={<GitBranchIcon />}
            title={workspaceId ? <GitTitle workspaceId={workspaceId} /> : 'Git'}
            size={shares.git ?? 1}
            actions={workspaceId ? <GitSectionMenu workspaceId={workspaceId} /> : undefined}
          >
            {workspaceId ? <GitSection workspaceId={workspaceId} /> : null}
          </AccordionSection>
        </div>
      </SidebarContent>

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
