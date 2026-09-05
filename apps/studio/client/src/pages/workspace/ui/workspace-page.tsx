import { PanelRightIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useDeskStore } from '@/features/desk';
import { useIdeSync, useIdeTabs } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Resizer } from '@/shared/ui/resizer';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { AgentDashboard } from '@/widgets/agent-dashboard';
import { AgentInspector } from '@/widgets/agent-inspector';
import { FileInspector } from '@/widgets/file-inspector';
import { IdeHome } from '@/widgets/ide-home';
import { WorkspaceSidebar } from '@/widgets/workspace-sidebar';

import { useInspectorWidth } from '../model/inspector-width';
import { IdeLayoutView } from './ide-layout-view';

export function WorkspacePage() {
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '15rem' } as CSSProperties}
      className="h-svh overflow-hidden"
    >
      <WorkspaceShell>
        <Outlet />
      </WorkspaceShell>
    </SidebarProvider>
  );
}

function WorkspaceShell({ children: _children }: { children: ReactNode }) {
  const { workspaceId, surface } = useStudioLocation();
  const ide = useIdeTabs(workspaceId);
  const tabs = ide.tabs;
  const activeTab = tabs.find((t) => t.id === ide.activeId) ?? null;
  const isFileTab = activeTab?.kind === 'file';
  const inspectorOpen = useDeskStore((state) => state.inspectorOpen);
  const { width: inspectorWidth, dragging, shellRef, onResizeStart } = useInspectorWidth();
  useIdeSync();
  const showInspector =
    inspectorOpen && (activeTab?.kind === 'thread' || activeTab?.kind === 'file');
  const hasTabs = tabs.length > 0;

  return (
    <div ref={shellRef} className="flex min-h-svh w-full" data-testid="workspace-shell">
      <WorkspaceSidebar />
      <SidebarInset className="min-w-0 bg-background">
        {workspaceId && hasTabs ? (
          <IdeLayoutView workspaceId={workspaceId} />
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
                className={cn('ml-auto', inspectorOpen && 'bg-muted text-foreground')}
                onClick={() => useDeskStore.getState().toggleInspector()}
              >
                <PanelRightIcon />
                <span className="sr-only">
                  {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                </span>
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {surface === 'agent' ? <AgentDashboard /> : <IdeHome />}
            </div>
          </>
        )}
      </SidebarInset>
      {showInspector ? (
        <>
          <Resizer
            label="Resize inspector"
            testId="inspector-split-resize"
            dragging={dragging}
            onResizeStart={onResizeStart}
          />
          {isFileTab && activeTab?.path && workspaceId ? (
            <FileInspector
              width={inspectorWidth}
              file={{ path: activeTab.path, dirty: Boolean(activeTab.dirty), workspaceId }}
            />
          ) : (
            <AgentInspector width={inspectorWidth} />
          )}
        </>
      ) : null}
    </div>
  );
}
