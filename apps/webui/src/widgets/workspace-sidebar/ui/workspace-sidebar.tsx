import { useQuery } from '@tanstack/react-query';
import { InboxIcon } from 'lucide-react';
import { Fragment, type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import { useThreadStore } from '@/entities/thread';
import {
  useAgentsInWorkspaces,
  useSchedulesInWorkspaces,
  useSelectedWorkspaceIds,
  useWaitingThreads,
  useWebhooksInWorkspaces,
} from '@/features/desk';
import { useIdeTabs } from '@/features/ide';
import { appMetaQuery } from '@/shared/api';
import {
  studioFocusThreadId,
  studioFocusWorkspaceId,
  useStudioLocation,
} from '@/shared/config/location';
import { AppLogo } from '@/shared/ui/app-logo';
import { Badge } from '@/shared/ui/badge.tsx';
import { Resizer } from '@/shared/ui/resizer';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/shared/ui/sidebar';
import { normalizeShares, useAccordionStore } from '../model/accordion.store';
import { useSectionDnd } from '../model/use-section-dnd';
import { AccordionSection } from './accordion-section';
import { AgentsSection, AgentsSectionActions } from './agents-section';
import { AutomationsSection, AutomationsSectionActions } from './automations-section';
import { ExplorerActions, ExplorerTitle, ExplorerTrees } from './files-section';
import { GitSectionMenu, GitTitle } from './git-menu';
import { GitSection } from './git-section';
import { InboxSection } from './inbox-section';
import { SECTION_META, type SidebarSectionId } from './sections-meta';
import { SidebarSectionsConfig } from './sidebar-sections-config';
import { TerminalSection, TerminalSectionActions } from './terminal-section';
import { WorkspaceHeader } from './workspace-header';

type OrderedSectionId = Exclude<SidebarSectionId, 'inbox'>;
export function WorkspaceSidebar() {
  const { data: meta } = useQuery(appMetaQuery);
  const focus = useStudioLocation();
  const workspaceId = studioFocusWorkspaceId(focus);
  const threadId = studioFocusThreadId(focus);
  const workspaceIds = useSelectedWorkspaceIds();
  const singleWorkspaceId = workspaceIds.length === 1 ? (workspaceIds[0] ?? null) : null;
  const multi = workspaceIds.length > 1;
  const inboxThreads = useWaitingThreads(workspaceIds);
  const agents = useAgentsInWorkspaces(workspaceIds);
  const schedules = useSchedulesInWorkspaces(workspaceIds);
  const webhooks = useWebhooksInWorkspaces(workspaceIds);
  const { setOpenMobile } = useSidebar();
  const ideTabs = useIdeTabs(workspaceId);
  const activeThreadId = ideTabs.tabs.find((tab) => tab.id === ideTabs.activeId)?.threadId ?? null;
  const activeAgentId = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.agentId ?? null) : null,
  );
  const activeScheduleId = focus.kind === 'schedule' ? focus.scheduleId : null;
  const activeWebhookId = focus.kind === 'webhook' ? focus.webhookId : null;
  const activeTerminalSessionId = focus.kind === 'terminal' ? focus.sessionId : null;
  const collapsed = useAccordionStore((state) => state.collapsed);
  const sizes = useAccordionStore((state) => state.sizes);
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPair, setDragPair] = useState<string | null>(null);
  const { draggingId, dropHintFor, headerProps } = useSectionDnd();
  const visibleSections = order.filter((id): id is OrderedSectionId => !hidden[id]);
  const expanded = visibleSections.filter((id) => !(collapsed[id] ?? false));
  const inboxVisible = !hidden.inbox;
  const inboxExpanded = inboxVisible && !(collapsed.inbox ?? false);
  const expandedWithInbox = inboxExpanded ? ['inbox', ...expanded] : expanded;
  const shares = normalizeShares(expandedWithInbox, sizes);
  const resizePairs: {
    upper: string;
    lower: string;
  }[] = [];
  let lastExpanded: string | null = null;
  for (const id of expandedWithInbox) {
    if (lastExpanded) {
      resizePairs.push({ upper: lastExpanded, lower: id });
    }
    lastExpanded = id;
  }
  const pairBefore = (id: string) => resizePairs.find((pair) => pair.lower === id) ?? null;
  const resizeNode = (id: OrderedSectionId) => {
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
  const beginResize = (upperId: string, lowerId: string) => (event: ReactMouseEvent) => {
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
  const renderSection = (id: OrderedSectionId) => {
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
            title="Agents"
            count={agents.filter((agent) => !agent.parentId).length}
            size={shares[id] ?? 1}
            actions={
              singleWorkspaceId ? (
                <AgentsSectionActions
                  workspaceId={singleWorkspaceId}
                  onCreated={() => setOpenMobile(false)}
                />
              ) : undefined
            }
            {...drag}
          >
            <AgentsSection
              workspaceIds={workspaceIds}
              agents={agents}
              activeAgentId={activeAgentId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
              groupActions={
                multi
                  ? (id) => (
                      <AgentsSectionActions
                        workspaceId={id}
                        onCreated={() => setOpenMobile(false)}
                      />
                    )
                  : undefined
              }
            />
          </AccordionSection>
        );
      case 'explorer':
        return (
          <AccordionSection
            id="explorer"
            icon={<Icon />}
            title={<ExplorerTitle workspaceIds={workspaceIds} />}
            size={shares[id] ?? 1}
            actions={<ExplorerActions />}
            {...drag}
          >
            <ExplorerTrees workspaceIds={workspaceIds} />
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
              singleWorkspaceId ? (
                <AutomationsSectionActions
                  workspaceId={singleWorkspaceId}
                  agents={agents}
                  onDone={() => setOpenMobile(false)}
                />
              ) : undefined
            }
            {...drag}
          >
            <AutomationsSection
              workspaceIds={workspaceIds}
              agents={agents}
              schedules={schedules}
              webhooks={webhooks}
              activeScheduleId={activeScheduleId}
              activeWebhookId={activeWebhookId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
              groupActions={
                multi
                  ? (id) => (
                      <AutomationsSectionActions
                        workspaceId={id}
                        agents={agents}
                        onDone={() => setOpenMobile(false)}
                      />
                    )
                  : undefined
              }
            />
          </AccordionSection>
        );
      case 'git':
        return (
          <AccordionSection
            id="git"
            icon={<Icon />}
            title={<GitTitle workspaceIds={workspaceIds} />}
            size={shares[id] ?? 1}
            actions={
              singleWorkspaceId ? <GitSectionMenu workspaceId={singleWorkspaceId} /> : undefined
            }
            {...drag}
          >
            <GitSection
              workspaceIds={workspaceIds}
              groupActions={multi ? (id) => <GitSectionMenu workspaceId={id} /> : undefined}
            />
          </AccordionSection>
        );
      case 'terminal':
        return (
          <AccordionSection
            id="terminal"
            icon={<Icon />}
            title="Terminal"
            size={shares[id] ?? 1}
            actions={
              singleWorkspaceId ? (
                <TerminalSectionActions
                  workspaceId={singleWorkspaceId}
                  onCreated={() => setOpenMobile(false)}
                />
              ) : undefined
            }
            {...drag}
          >
            <TerminalSection
              workspaceIds={workspaceIds}
              activeSessionId={activeTerminalSessionId}
              onSelectDone={() => setOpenMobile(false)}
              groupActions={
                multi
                  ? (id) => (
                      <TerminalSectionActions
                        workspaceId={id}
                        onCreated={() => setOpenMobile(false)}
                      />
                    )
                  : undefined
              }
            />
          </AccordionSection>
        );
    }
  };
  return (
    <Sidebar collapsible="icon" data-testid="workspace-sidebar">
      <SidebarHeader className="p-2">
        <WorkspaceHeader />
      </SidebarHeader>

      <SidebarContent className="gap-1 group-data-[collapsible=icon]:overflow-y-auto">
        <div ref={containerRef} className="flex min-h-0 flex-auto flex-col gap-1 px-2 pb-2">
          {inboxVisible ? (
            <AccordionSection
              id="inbox"
              icon={<InboxIcon />}
              title="Inbox"
              count={inboxThreads.length}
              size={shares.inbox ?? 1}
            >
              <InboxSection
                workspaceIds={workspaceIds}
                threads={inboxThreads}
                activeThreadId={activeThreadId}
                onSelectDone={() => setOpenMobile(false)}
              />
            </AccordionSection>
          ) : null}
          {visibleSections.map((id, index) => (
            <Fragment key={id}>
              {index > 0 || inboxExpanded ? resizeNode(id) : null}
              {renderSection(id)}
            </Fragment>
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <div
              className="flex flex-1 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              data-testid="app-logo"
              title="Harnesys"
            >
              <AppLogo className="size-5.5" />
              <span className="flex items-center gap-1 font-medium text-sm tracking-tight group-data-[collapsible=icon]:hidden">
                Harnesys
                {meta ? (
                  <Badge variant="secondary" className="text-muted-foreground">
                    v{meta.version}
                  </Badge>
                ) : null}
              </span>
            </div>
            <SidebarSectionsConfig />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
