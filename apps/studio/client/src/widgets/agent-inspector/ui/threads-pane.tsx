import { MessageSquareIcon, MessageSquarePlusIcon, TrashIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { clearActiveThreadId, setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';

export function InspectorThreadsPane({ agent }: { agent: Agent | null }) {
  const navigate = useNavigate();
  const rawThreads = useThreadStore(
    useShallow((s) => (agent ? s.items.filter((t) => t.agentId === agent.id) : [])),
  );
  const threads = useMemo(
    () => [...rawThreads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [rawThreads],
  );

  if (!agent) {
    return <p className="text-muted-foreground text-xs">Select an agent to see its threads.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          Threads — {threads.length}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          title="New thread"
          onClick={() => {
            void openNewThread(agent.id, agent.workspaceId).then((threadId) => {
              if (threadId) {
                useIdeStore.getState().openThread(agent.workspaceId, agent.id, threadId);
                useDeskStore.getState().setFocusedThreadId(threadId);
                setActiveThreadId(agent.id, threadId);
                void navigate(studioPath.workspaceThread(agent.workspaceId, agent.id, threadId));
                useDeskStore.getState().setInspectorTab('threads');
              }
            });
          }}
        >
          <MessageSquarePlusIcon className="size-3.5" />
        </Button>
      </div>
      {threads.length === 0 ? (
        <p className="text-muted-foreground text-xs">No threads yet. Create one.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="group/thread flex items-center gap-2 rounded-md border border-border/40 px-2 py-2 hover:bg-muted/40"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                onClick={() => {
                  useIdeStore.getState().openThread(agent.workspaceId, agent.id, thread.id);
                  useDeskStore.getState().setFocusedThreadId(thread.id);
                  setActiveThreadId(agent.id, thread.id);
                  void navigate(studioPath.workspaceThread(agent.workspaceId, agent.id, thread.id));
                }}
              >
                <span className="flex items-center gap-1.5 truncate font-medium text-xs">
                  <MessageSquareIcon className="size-3 shrink-0 opacity-60" />
                  <span className="truncate">{thread.title}</span>
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
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
                      useSessionStore.getState().removeForThreads([thread.id]);
                      useThreadStore.getState().remove(thread.id);
                      useIdeStore.getState().closeByEntity(agent.workspaceId, 'thread', thread.id);
                      if (useDeskStore.getState().focusedThreadId === thread.id) {
                        const next = useThreadStore.getState().latestForAgent(agent.id);
                        useDeskStore.getState().setFocusedThreadId(next?.id ?? null);
                        if (next) {
                          setActiveThreadId(agent.id, next.id);
                        } else {
                          clearActiveThreadId(agent.id);
                        }
                      }
                    })();
                  });
                }}
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
