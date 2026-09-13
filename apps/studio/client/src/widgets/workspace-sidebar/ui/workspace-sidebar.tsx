import { ChevronsUpDownIcon, PlusIcon, SettingsIcon } from 'lucide-react';
import { Fragment, type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import { useThreadStore } from '@/entities/thread';
import { useWorkspaces } from '@/entities/workspace';
import { openCreateWorkspaceDialog } from '@/features/create-workspace';
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
import { useSectionDnd } from '../model/use-section-dnd';
import { AccordionSection } from './accordion-section';
import { AgentsSection, AgentsSectionActions } from './agents-section';
import { AutomationsAddMenu, AutomationsSection } from './automations-section';
import { ExplorerActions, ExplorerContent, ExplorerTitle } from './files-section';
import { GitSectionMenu, GitTitle } from './git-menu';
import { GitSection } from './git-section';
import { SECTION_META, type SidebarSectionId } from './sections-meta';
import { SidebarSectionsConfig } from './sidebar-sections-config';

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
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPair, setDragPair] = useState<string | null>(null);
  const { draggingId, dropHintFor, headerProps } = useSectionDnd();

  const visibleSections = order.filter((id): id is SidebarSectionId => !hidden[id]);
  const expanded = visibleSections.filter((id) => !(collapsed[id] ?? false));
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

  const renderSection = (id: SidebarSectionId) => {
    const Icon = SECTION_META[id].icon;
    const drag = {
      headerDragProps: headerProps(id),
      dragging: draggingId === id,
      dropHint: dropHintFor(id),
    };
    switch (id) {
      case 'agents':
        return (
          <AccordionSection
            id="agents"
            icon={<Icon />}
            title={slideAgent ? `Threads · ${slideAgent.name}` : 'Agents'}
            count={
              slideAgent ? slideThreads.length : agents.filter((agent) => !agent.parentId).length
            }
            size={shares[id] ?? 1}
            actions={<AgentsSectionActions workspaceId={workspaceId} />}
            {...drag}
          >
            <AgentsSection
              workspaceId={workspaceId}
              agents={agents}
              activeAgentId={activeAgentId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
            />
          </AccordionSection>
        );
      case 'explorer':
        return (
          <AccordionSection
            id="explorer"
            icon={<Icon />}
            title={workspaceId ? <ExplorerTitle workspaceId={workspaceId} /> : 'Explorer'}
            size={shares[id] ?? 1}
            actions={workspaceId ? <ExplorerActions /> : undefined}
            {...drag}
          >
            {workspaceId ? <ExplorerContent workspaceId={workspaceId} /> : null}
          </AccordionSection>
        );
      case 'automations':
        return (
          <AccordionSection
            id="automations"
            icon={<Icon />}
            title="Automations"
            count={schedules.length + webhooks.length}
            size={shares[id] ?? 1}
            actions={
              <AutomationsAddMenu
                workspaceId={workspaceId}
                agents={agents}
                onDone={() => setOpenMobile(false)}
              />
            }
            {...drag}
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
        );
      case 'git':
        return (
          <AccordionSection
            id="git"
            icon={<Icon />}
            title={workspaceId ? <GitTitle workspaceId={workspaceId} /> : 'Git'}
            size={shares[id] ?? 1}
            actions={workspaceId ? <GitSectionMenu workspaceId={workspaceId} /> : undefined}
            {...drag}
          >
            {workspaceId ? <GitSection workspaceId={workspaceId} /> : null}
          </AccordionSection>
        );
    }
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
            <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground opacity-60 group-data-[collapsible=icon]:hidden" />
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
              <DropdownMenuItem onClick={() => leaveWorkspace()}>All workspaces</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 group-data-[collapsible=icon]:overflow-y-auto">
        <div ref={containerRef} className="flex min-h-0 flex-auto flex-col gap-1 px-2 pb-2">
          {visibleSections.map((id, index) => (
            <Fragment key={id}>
              {index > 0 ? resizeNode(id) : null}
              {renderSection(id)}
            </Fragment>
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <SidebarMenuButton
              className="flex-1"
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
            <SidebarSectionsConfig />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
