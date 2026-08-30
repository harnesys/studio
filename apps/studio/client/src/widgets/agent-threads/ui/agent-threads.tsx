import { MessageSquareIcon, MessageSquarePlusIcon, TrashIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useJournalStore } from '@/entities/journal';
import { clearActiveThreadId, setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';

export function AgentThreads({ workspaceId, agentId }: { workspaceId: string; agentId: string }) {
  const rawThreads = useThreadStore(
    useShallow((s) => (agentId ? s.items.filter((t) => t.agentId === agentId) : [])),
  );
  const threads = useMemo(
    () => [...rawThreads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [rawThreads],
  );
  const navigate = useNavigate();
  const { workspaceId: ws } = useStudioLocation();
  const activeWorkspaceId = workspaceId ?? ws;

  if (!activeWorkspaceId) {
    return null;
  }

  return (
    <div className="ml-6 flex flex-col gap-0.5 border-border/40 border-l pl-2 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          Threads
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          title="New thread"
          onClick={() => {
            void openNewThread(agentId, activeWorkspaceId).then((threadId) => {
              if (threadId) {
                useIdeStore.getState().openThread(activeWorkspaceId, agentId, threadId);
                useDeskStore.getState().setFocusedThreadId(threadId);
                setActiveThreadId(agentId, threadId);
                void navigate(studioPath.workspaceThread(activeWorkspaceId, agentId, threadId));
              }
            });
          }}
        >
          <MessageSquarePlusIcon className="size-3" />
        </Button>
      </div>
      {threads.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-muted-foreground">No threads yet.</p>
      ) : (
        threads.map((thread) => (
          <div
            key={thread.id}
            className="group/thread flex items-center gap-1 rounded-md px-1 py-1 hover:bg-sidebar-accent/60"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs"
              onClick={() => {
                useIdeStore.getState().openThread(activeWorkspaceId, agentId, thread.id);
                useDeskStore.getState().setFocusedThreadId(thread.id);
                setActiveThreadId(agentId, thread.id);
                void navigate(studioPath.workspaceThread(activeWorkspaceId, agentId, thread.id));
              }}
              title={thread.title}
            >
              <MessageSquareIcon className="size-3 shrink-0 opacity-60" />
              <span className="truncate">{thread.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatDayTime(thread.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              className="opacity-0 hover:text-destructive group-hover/thread:opacity-100"
              title="Delete thread"
              onClick={() => {
                void confirmDeleteThread(thread).then((confirmed) => {
                  if (!confirmed) {
                    return;
                  }
                  void (async () => {
                    try {
                      await deleteThreadRecord(thread.id);
                    } catch {
                      return;
                    }
                    useJournalStore.getState().removeForThreads([thread.id]);
                    useThreadStore.getState().remove(thread.id);
                    useIdeStore.getState().closeByEntity(activeWorkspaceId, 'thread', thread.id);
                    if (useDeskStore.getState().focusedThreadId === thread.id) {
                      const next = useThreadStore.getState().latestForAgent(agentId);
                      useDeskStore.getState().setFocusedThreadId(next?.id ?? null);
                      if (next) {
                        setActiveThreadId(agentId, next.id);
                      } else {
                        clearActiveThreadId(agentId);
                      }
                    }
                  })();
                });
              }}
            >
              <TrashIcon className="size-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
