import {
  CalendarClockIcon,
  MessageSquareIcon,
  PanelRightIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import {
  useAgentThreads,
  useDeskStore,
  useSelectedAgent,
  useSelectedThread,
  useSelectThread,
} from '@/features/desk';
import {
  closeThread,
  confirmDeleteThread,
  openNewThread,
  threadById,
} from '@/features/switch-thread';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';

function focusThread(threadId: string) {
  useDeskStore.getState().setFocusedThreadId(threadId);
}

export function ThreadTabs() {
  const { workspaceId } = useStudioLocation();
  const agent = useSelectedAgent();
  const threads = useAgentThreads(agent?.id ?? null);
  const thread = useSelectedThread();
  const inspectorOpen = useDeskStore((state) => state.inspectorOpen);
  const { openAgent, openThread } = useStudioNavigation();
  const selectThread = useSelectThread();
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
  }, [thread?.id]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="thread-tabs">
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {threads.map((item) => {
            const selected = item.id === thread?.id;
            const resolved = threadById(threads, item.id);
            return (
              <div
                key={item.id}
                ref={selected ? activeTabRef : null}
                data-testid={`thread-tab-${item.id}`}
                data-selected={selected ? 'true' : 'false'}
                className={cn(
                  'group/tab relative flex h-6 max-w-52 shrink-0 animate-tab-enter items-center rounded-md border-transparent border-x-2 py-0.5 pl-2 text-[0.75rem] transition-colors duration-150',
                  selected
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  item.unread && 'border-x-live',
                  item.kind === 'schedule' ? 'pr-2' : 'pr-0.5',
                )}
              >
                <button
                  type="button"
                  className="relative flex min-w-0 flex-1 items-center gap-1.5 truncate"
                  onClick={() => {
                    if (agent && workspaceId && !selected) {
                      selectThread(workspaceId, agent.id, item.id);
                    }
                  }}
                >
                  {item.kind === 'schedule' ? (
                    <CalendarClockIcon className="size-3.5 shrink-0 opacity-60" aria-hidden />
                  ) : (
                    <MessageSquareIcon className="size-3.5 shrink-0 opacity-60" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'truncate leading-3',
                      item.unread && !selected && 'font-medium text-foreground',
                    )}
                  >
                    {resolved?.title ?? item.title}
                  </span>
                  {item.unread ? <span className="sr-only">Unread</span> : null}
                </button>
                {item.kind === 'schedule' ? null : (
                  <button
                    type="button"
                    data-testid={`thread-close-${item.id}`}
                    className={cn(
                      'flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-opacity duration-150 hover:bg-background/30 hover:text-foreground',
                      selected ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!agent || !workspaceId) {
                        return;
                      }
                      void confirmDeleteThread(item).then((confirmed) => {
                        if (!confirmed) {
                          return;
                        }
                        void closeThread(item.id).then((nextId) => {
                          if (nextId) {
                            focusThread(nextId);
                            openThread(workspaceId, agent.id, nextId);
                          } else {
                            useDeskStore.getState().setFocusedThreadId(null);
                            openAgent(workspaceId, agent.id);
                          }
                        });
                      });
                    }}
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">Close thread</span>
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            data-testid="new-thread"
            title="New thread"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[0.75rem] text-muted-foreground/40 transition-all duration-150 hover:bg-muted/50 hover:text-foreground active:scale-95"
            onClick={() => {
              if (!agent || !workspaceId) {
                return;
              }
              void openNewThread(agent.id, workspaceId).then((threadId) => {
                if (threadId) {
                  focusThread(threadId);
                  openThread(workspaceId, agent.id, threadId);
                }
              });
            }}
          >
            <PlusIcon className="size-3" />
            <span>New thread</span>
          </button>
        </div>
      </ScrollArea>
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
    </div>
  );
}
