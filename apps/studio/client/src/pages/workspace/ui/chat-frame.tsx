import type { ReactNode } from 'react';
import { useWorkspaceOpenFiles } from '@/features/open-file';
import { useStudioLocation } from '@/shared/config/location';
import { Resizer } from '@/shared/ui/resizer';
import { SidebarTrigger } from '@/shared/ui/sidebar';
import { FilePane, FileTabs } from '@/widgets/file-pane';
import { ThreadTabs } from '@/widgets/thread-tabs';
import { useFilePaneRatio } from '../model/file-pane-ratio';

export function ChatFrame({ children }: { children: ReactNode }) {
  const { workspaceId } = useStudioLocation();
  const openFiles = useWorkspaceOpenFiles(workspaceId);
  const splitOpen = openFiles.tabs.length > 0;
  const { fileRatio, dragging, shellRef, onResizeStart } = useFilePaneRatio();

  return (
    <div ref={shellRef} className="relative flex min-h-0 min-w-0 flex-1" data-testid="chat-frame">
      {/* Keep mounted: remounting beside Monaco unmount throws insertBefore NotFoundError. */}
      <div className="pointer-events-none absolute top-0 left-0 z-20 flex h-11 items-center pl-3">
        <SidebarTrigger className="pointer-events-auto" />
      </div>

      {splitOpen ? (
        <>
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={{ width: `${fileRatio * 100}%`, flex: 'none' }}
          >
            <header className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-3">
              <div className="w-7 shrink-0" aria-hidden />
              <FileTabs />
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <FilePane />
            </div>
          </div>
          <Resizer
            label="Resize file pane"
            testId="file-split-resize"
            dragging={dragging}
            onResizeStart={onResizeStart}
          />
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 px-3">
          {splitOpen ? null : <div className="w-7 shrink-0" aria-hidden />}
          <ThreadTabs />
        </header>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
