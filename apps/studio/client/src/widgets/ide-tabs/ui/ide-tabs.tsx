import { EllipsisIcon, PanelLeftIcon, PanelRightIcon, Trash2Icon, XIcon } from 'lucide-react';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { type IdeTab, useIdeGroup, useIdeStore, useIdeTabs } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SidebarTrigger } from '@/shared/ui/sidebar';
import { ideDrag, setIdeDrag, takeIdeDrag } from '../model/ide-dnd';
import { TabIcon, useTabLabel } from './tab-meta';

export function IdeGroupTabs({
  workspaceId,
  groupId,
  leading = false,
  trailing = false,
}: {
  workspaceId: string;
  groupId: string;
  leading?: boolean;
  trailing?: boolean;
}) {
  const group = useIdeGroup(workspaceId, groupId);
  const ws = useIdeTabs(workspaceId);
  const { surface } = useStudioLocation();
  const navigate = useNavigate();
  const inspectorOpen = useDeskStore((state) => state.inspectorOpen);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [barDragOver, setBarDragOver] = useState(false);
  const tabs = group
    ? group.tabIds
        .map((id) => ws.tabs.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
    : [];

  useLayoutEffect(() => {
    const el = activeRef.current;
    if (!el) {
      return;
    }
    const viewport = el.closest('[data-slot="scroll-area-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const box = el.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    if (box.left < view.left || box.right > view.right) {
      el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
  }, [group?.activeId]);

  if (!group) {
    return null;
  }
  const activeId = group.activeId;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for tabs dragged between editor groups
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-1 pr-2 pl-3 transition-colors duration-150',
        barDragOver && 'bg-muted/60 ring-1 ring-ring ring-inset',
      )}
      data-testid={`ide-group-tabs-${groupId}`}
      onDragOver={(e) => {
        const drag = ideDrag();
        if (!drag || drag.workspaceId !== workspaceId) {
          return;
        }
        e.preventDefault();
        setBarDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setBarDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setBarDragOver(false);
        const drag = takeIdeDrag();
        if (!drag || drag.workspaceId !== workspaceId) {
          return;
        }
        useIdeStore.getState().moveTab(workspaceId, drag.tabId, groupId, null);
      }}
    >
      {leading ? <SidebarTrigger className="mr-1 shrink-0" /> : null}
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <IdeTabView
              key={tab.id}
              tab={tab}
              workspaceId={workspaceId}
              groupId={groupId}
              isActive={tab.id === activeId}
              dimmed={surface === 'agent'}
              scrollRef={activeRef}
              isDragOver={dragOverId === tab.id}
              onDragOverTab={setDragOverId}
              onDragLeaveTab={() => setDragOverId(null)}
              onSelect={() => handleSelect(tab)}
              onClose={() => handleCloseTab(tab.id)}
            />
          ))}
        </div>
      </ScrollArea>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="ide-group-menu"
          title="Editor group options"
          aria-label="Editor group options"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <EllipsisIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            data-testid="split-left"
            onClick={() => useIdeStore.getState().splitGroup(workspaceId, groupId, 'left')}
            disabled={!activeId}
          >
            <PanelLeftIcon /> Split Left
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="split-right"
            onClick={() => useIdeStore.getState().splitGroup(workspaceId, groupId, 'right')}
            disabled={!activeId}
          >
            <PanelRightIcon /> Split Right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="close-tab"
            disabled={!activeId}
            onClick={handleCloseActive}
          >
            <XIcon /> Close Tab
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="close-group"
            onClick={() => {
              useIdeStore.getState().closeGroup(workspaceId, groupId);
              navigateHomeIfEmpty();
            }}
          >
            <XIcon /> Close Group
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="close-all"
            disabled={tabs.length === 0}
            onClick={handleCloseAll}
          >
            <Trash2Icon /> Close All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {trailing ? (
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="toggle-inspector"
          title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          aria-pressed={inspectorOpen}
          className={cn('shrink-0', inspectorOpen && 'bg-muted text-foreground')}
          onClick={() => useDeskStore.getState().toggleInspector()}
        >
          <PanelRightIcon />
          <span className="sr-only">{inspectorOpen ? 'Hide inspector' : 'Show inspector'}</span>
        </Button>
      ) : null}
    </div>
  );

  function handleSelect(tab: (typeof tabs)[number]) {
    useIdeStore.getState().setActive(workspaceId, tab.id);
    if (tab.kind === 'thread' && tab.threadId) {
      const thread = useThreadStore.getState().byId(tab.threadId);
      if (useDeskStore.getState().focusedThreadId !== tab.threadId) {
        useDeskStore.getState().setFocusedThreadId(tab.threadId);
      }
      if (thread) {
        setActiveThreadId(thread.agentId, tab.threadId);
      }
      void navigate(studioPath.thread(workspaceId, tab.threadId));
      return;
    }
    if (tab.kind === 'file' && tab.path) {
      void navigate(studioPath.file(workspaceId, tab.path));
    }
  }

  function handleCloseTab(tabId: string) {
    const before = useIdeStore.getState().byWorkspace[workspaceId];
    const closingActive = before?.activeId === tabId;
    useIdeStore.getState().closeTab(workspaceId, tabId);
    if (!closingActive) {
      return;
    }
    const after = useIdeStore.getState().byWorkspace[workspaceId];
    if (!after) {
      void navigate(studioPath.workspace(workspaceId));
      return;
    }
    const next = after.tabs.find((t) => t.id === after.activeId);
    if (next) {
      handleSelect(next);
    }
  }

  function handleCloseActive() {
    if (activeId) {
      handleCloseTab(activeId);
    }
  }

  function handleCloseAll() {
    useIdeStore.getState().closeAll(workspaceId);
    void navigate(studioPath.workspace(workspaceId));
  }

  function navigateHomeIfEmpty() {
    if (!useIdeStore.getState().byWorkspace[workspaceId]) {
      void navigate(studioPath.workspace(workspaceId));
    }
  }
}

function IdeTabView({
  tab,
  workspaceId,
  groupId,
  isActive,
  dimmed,
  scrollRef,
  isDragOver,
  onDragOverTab,
  onDragLeaveTab,
  onSelect,
  onClose,
}: {
  tab: IdeTab;
  workspaceId: string;
  groupId: string;
  isActive: boolean;
  dimmed: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  isDragOver: boolean;
  onDragOverTab: (tabId: string) => void;
  onDragLeaveTab: () => void;
  onSelect: () => void;
  onClose: () => void;
}) {
  // Dashboard surface shows tabs for navigation only: none reads as selected.
  const selected = isActive && !dimmed;
  const label = useTabLabel(tab);
  return (
    <div
      ref={selected ? scrollRef : null}
      role="tab"
      tabIndex={0}
      data-testid={`ide-tab-${tab.id}`}
      data-selected={selected ? 'true' : 'false'}
      draggable
      onDragStart={(e) => {
        setIdeDrag({ tabId: tab.id, fromGroupId: groupId, workspaceId });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
      }}
      onDragEnd={() => setIdeDrag(null)}
      onDragOver={(e) => {
        const drag = ideDrag();
        if (!drag || drag.workspaceId !== workspaceId) {
          return;
        }
        e.preventDefault();
        onDragOverTab(tab.id);
      }}
      onDragLeave={onDragLeaveTab}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragLeaveTab();
        const drag = takeIdeDrag();
        if (!drag || drag.workspaceId !== workspaceId) {
          return;
        }
        const { moveTab, reorderTab } = useIdeStore.getState();
        if (drag.fromGroupId === groupId) {
          reorderTab(workspaceId, drag.tabId, tab.id);
          return;
        }
        moveTab(workspaceId, drag.tabId, groupId, tab.id);
      }}
      className={cn(
        'group/tab relative flex max-w-52 shrink-0 animate-tab-enter items-center rounded-md p-0.5 pl-2 text-[0.75rem] transition-colors duration-150',
        selected
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        isDragOver && 'ring-1 ring-ring',
      )}
    >
      <button
        type="button"
        className="relative flex min-w-0 flex-1 items-center gap-1.5 truncate"
        title={label}
        onClick={onSelect}
      >
        <TabIcon tab={tab} />
        {tab.kind === 'file' && tab.dirty ? (
          <span className="size-1.5 shrink-0 rounded-full bg-live" title="Unsaved" />
        ) : null}
        <span className="truncate leading-3">{label}</span>
      </button>
      <button
        type="button"
        data-testid={`ide-close-${tab.id}`}
        className={cn(
          'flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-opacity duration-150 hover:bg-background/30 hover:text-foreground',
          selected ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close tab"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
