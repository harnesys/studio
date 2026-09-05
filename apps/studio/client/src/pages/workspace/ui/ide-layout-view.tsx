import { type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import type { IdeSplitNode, IdeTab } from '@/features/ide';
import {
  firstGroupOfLayout,
  lastGroupOfLayout,
  useIdeGroup,
  useIdeStore,
  useIdeTabs,
} from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import { Resizer } from '@/shared/ui/resizer';
import { AgentDashboard } from '@/widgets/agent-dashboard';
import { IdeTabContent } from '@/widgets/ide-content';
import { IdeGroupTabs, ideDrag, takeIdeDrag } from '@/widgets/ide-tabs';

export function IdeLayoutView({ workspaceId }: { workspaceId: string }) {
  const layout = useIdeStore((state) => state.byWorkspace[workspaceId]?.layout ?? null);
  if (!layout) {
    return null;
  }
  return (
    <SplitNodeView
      node={layout}
      workspaceId={workspaceId}
      leadingGroupId={firstGroupOfLayout(layout)}
      trailingGroupId={lastGroupOfLayout(layout)}
    />
  );
}

function SplitNodeView({
  node,
  workspaceId,
  leadingGroupId,
  trailingGroupId,
}: {
  node: IdeSplitNode;
  workspaceId: string;
  leadingGroupId: string;
  trailingGroupId: string;
}) {
  if (node.kind === 'group') {
    return (
      <IdeGroupPane
        workspaceId={workspaceId}
        groupId={node.groupId}
        leading={node.groupId === leadingGroupId}
        trailing={node.groupId === trailingGroupId}
      />
    );
  }
  return (
    <IdeSplitView
      node={node}
      workspaceId={workspaceId}
      leadingGroupId={leadingGroupId}
      trailingGroupId={trailingGroupId}
    />
  );
}

function GroupContent({
  surface,
  workspaceId,
  activeTab,
}: {
  surface: string;
  workspaceId: string;
  activeTab: IdeTab | null;
}) {
  if (surface === 'agent') {
    return <AgentDashboard />;
  }
  if (activeTab) {
    return <IdeTabContent tab={activeTab} workspaceId={workspaceId} />;
  }
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
      No tab
    </div>
  );
}

function IdeSplitView({
  node,
  workspaceId,
  leadingGroupId,
  trailingGroupId,
}: {
  node: Extract<IdeSplitNode, { kind: 'split' }>;
  workspaceId: string;
  leadingGroupId: string;
  trailingGroupId: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const onResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    const box = ref.current?.getBoundingClientRect();
    if (!box) {
      return;
    }
    setDragging(true);
    const onMove = (move: MouseEvent) => {
      const ratio = (move.clientX - box.left) / box.width;
      useIdeStore.getState().setSplitRatio(workspaceId, node.splitId, ratio);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={ref}
      className="flex min-h-0 min-w-0 flex-1"
      data-testid={`ide-split-${node.splitId}`}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col"
        style={{ width: `${node.ratio * 100}%`, flex: 'none' }}
      >
        <SplitNodeView
          node={node.first}
          workspaceId={workspaceId}
          leadingGroupId={leadingGroupId}
          trailingGroupId={trailingGroupId}
        />
      </div>
      <Resizer
        label="Resize split"
        testId="ide-split-resize"
        dragging={dragging}
        onResizeStart={onResizeStart}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SplitNodeView
          node={node.second}
          workspaceId={workspaceId}
          leadingGroupId={leadingGroupId}
          trailingGroupId={trailingGroupId}
        />
      </div>
    </div>
  );
}

function IdeGroupPane({
  workspaceId,
  groupId,
  leading,
  trailing,
}: {
  workspaceId: string;
  groupId: string;
  leading: boolean;
  trailing: boolean;
}) {
  const group = useIdeGroup(workspaceId, groupId);
  const ws = useIdeTabs(workspaceId);
  const { surface } = useStudioLocation();
  const [dragOver, setDragOver] = useState(false);
  if (!group) {
    return null;
  }
  const activeTab = ws.tabs.find((t) => t.id === group.activeId) ?? null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for editor tabs dragged between groups
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        dragOver && 'ring-1 ring-ring ring-inset',
      )}
      data-testid={`ide-group-${groupId}`}
      onDragOver={(e) => {
        const drag = ideDrag();
        if (!drag || drag.workspaceId !== workspaceId) {
          return;
        }
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const drag = takeIdeDrag();
        if (!drag || drag.workspaceId !== workspaceId) {
          return;
        }
        useIdeStore.getState().moveTab(workspaceId, drag.tabId, groupId, null);
      }}
    >
      <IdeGroupTabs
        workspaceId={workspaceId}
        groupId={groupId}
        leading={leading}
        trailing={trailing}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <GroupContent surface={surface} workspaceId={workspaceId} activeTab={activeTab} />
      </div>
    </div>
  );
}
