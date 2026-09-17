import { PanelRightIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router';
import { useDeskStore, useSelectedWorkspaceIds } from '@/features/desk';
import { useIdeSync, useVisibleDesk, visibleDeskActiveTab } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Resizer } from '@/shared/ui/resizer';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { AgentInspector } from '@/widgets/agent-inspector';
import { FileInspector } from '@/widgets/file-inspector';
import { WorkspaceSidebar } from '@/widgets/workspace-sidebar';

import { useInspectorWidth } from '../model/inspector-width';
import { IdeLayoutView } from './ide-layout-view';

export function WorkspacePage() {
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '15rem' } as CSSProperties}
      className="h-svh overflow-hidden"
    >
      <WorkspaceShell />
    </SidebarProvider>
  );
}

function WorkspaceShell() {
  const params = useParams();
  const focus = useStudioLocation();
  const selectedIds = useSelectedWorkspaceIds();
  const desk = useVisibleDesk();
  const activeTab = visibleDeskActiveTab(desk);
  const isFileTab = activeTab?.kind === 'file';
  const inspectorOpen = useDeskStore((state) => state.inspectorOpen);
  const { width: inspectorWidth, dragging, shellRef, onResizeStart } = useInspectorWidth();
  useIdeSync();
  const bareWorkspace = Boolean(params.workspaceId && focus.kind === 'none');
  const showInspector =
    !bareWorkspace &&
    inspectorOpen &&
    activeTab !== null &&
    (activeTab.kind === 'thread' ||
      activeTab.kind === 'file' ||
      activeTab.kind === 'schedule' ||
      activeTab.kind === 'webhook');
  const hasTabs = desk.tabs.length > 0;
  const layoutIds = selectedIds.filter((id) => desk.tabs.some((tab) => tab.workspaceId === id));

  if (bareWorkspace) {
    return <Navigate to={studioPath.desk} replace />;
  }

  return (
    <div ref={shellRef} className="flex min-h-svh w-full" data-testid="workspace-shell">
      <WorkspaceSidebar />
      <SidebarInset className="min-w-0 bg-background">
        {hasTabs ? (
          <div className="flex min-h-0 min-w-0 flex-1">
            {layoutIds.map((id) => (
              <IdeLayoutView key={id} workspaceId={id} />
            ))}
          </div>
        ) : (
          <>
            <div className="flex h-11 shrink-0 items-center gap-2 px-3">
              <SidebarTrigger />
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="toggle-inspector"
                title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                aria-pressed={inspectorOpen}
                disabled
                className={cn('ml-auto', inspectorOpen && 'bg-muted text-foreground')}
                onClick={() => useDeskStore.getState().toggleInspector()}
              >
                <PanelRightIcon />
                <span className="sr-only">
                  {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                </span>
              </Button>
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
              data-testid="empty-desk"
            >
              <p className="text-muted-foreground text-sm">
                {selectedIds.length === 0
                  ? 'No workspace selected. Toggle a tab above or create one from ⋯.'
                  : 'No open tabs. Pick a thread, file, or automation in the sidebar.'}
              </p>
            </div>
          </>
        )}
      </SidebarInset>
      {showInspector && activeTab ? (
        <>
          <Resizer
            label="Resize inspector"
            testId="inspector-split-resize"
            dragging={dragging}
            onResizeStart={onResizeStart}
          />
          {isFileTab && activeTab.path ? (
            <FileInspector
              width={inspectorWidth}
              file={{
                path: activeTab.path,
                dirty: Boolean(activeTab.dirty),
                workspaceId: activeTab.workspaceId,
              }}
            />
          ) : (
            <AgentInspector width={inspectorWidth} />
          )}
        </>
      ) : null}
    </div>
  );
}
