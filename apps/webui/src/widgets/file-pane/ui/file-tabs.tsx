import { XIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import {
  closeWorkspaceFile,
  fileBasename,
  selectWorkspaceFile,
  useWorkspaceOpenFiles,
} from '@/features/open-file';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';
import { ScrollArea } from '@/shared/ui/scroll-area';
export function FileTabs() {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const { tabs, activePath } = useWorkspaceOpenFiles(workspaceId);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const tab = activeTabRef.current;
    if (!tab) {
      return;
    }
    const viewport = tab.closest('[data-slot="scroll-area-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const tabBox = tab.getBoundingClientRect();
    const viewBox = viewport.getBoundingClientRect();
    if (tabBox.left < viewBox.left || tabBox.right > viewBox.right) {
      tab.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
  }, []);
  if (!workspaceId || tabs.length === 0) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="file-tabs">
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {tabs.map((item) => {
            const selected = item.path === activePath;
            return (
              <div
                key={item.path}
                ref={selected ? activeTabRef : null}
                data-testid={`file-tab-${item.path}`}
                data-selected={selected ? 'true' : 'false'}
                className={cn(
                  'group/tab relative flex max-w-52 shrink-0 animate-tab-enter items-center rounded-md p-0.5 pl-2 text-[0.75rem] transition-colors duration-150',
                  selected
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <button
                  type="button"
                  className="relative flex min-w-0 flex-1 items-center gap-1.5 truncate"
                  title={item.path}
                  onClick={() => {
                    if (!selected && workspaceId) {
                      selectWorkspaceFile(workspaceId, item.path);
                    }
                  }}
                >
                  <FileTypeIcon
                    name={item.path}
                    className="size-3.5 shrink-0 opacity-70 saturate-70"
                  />
                  {item.dirty ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-live"
                      title="Unsaved changes"
                    />
                  ) : null}
                  <span className="truncate leading-3">{fileBasename(item.path)}</span>
                </button>
                <button
                  type="button"
                  data-testid={`file-close-${item.path}`}
                  className={cn(
                    'flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-opacity duration-150 hover:bg-background/30 hover:text-foreground',
                    selected ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (workspaceId) {
                      closeWorkspaceFile(workspaceId, item.path);
                    }
                  }}
                >
                  <XIcon className="size-3" />
                  <span className="sr-only">Close file</span>
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
