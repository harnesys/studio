import { ChevronLeftIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { setActiveThreadId, type Thread, useThreadStore } from '@/entities/thread';
import { useAgentsSlideStore, useAgentThreads, useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord, setThreadPinned } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { AgentThreadRow } from './agent-thread-row';

export function AgentThreadsPanel({
  agent,
  workspaceId,
  activeThreadId,
  onDone,
}: {
  agent: Agent;
  workspaceId: string;
  activeThreadId: string | null;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const back = useAgentsSlideStore((state) => state.back);
  const threads = useAgentThreads(agent.id);
  const sorted = [...threads].sort((a, b) => {
    const pinDelta = Number(b.pinned === true) - Number(a.pinned === true);
    if (pinDelta !== 0) {
      return pinDelta;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const openThread = (thread: Thread) => {
    useIdeStore.getState().openThread(workspaceId, thread.agentId, thread.id);
    useDeskStore.getState().setFocusedThreadId(thread.id);
    setActiveThreadId(thread.agentId, thread.id);
    void navigate(studioPath.thread(workspaceId, thread.id, { kind: 'agent', id: thread.agentId }));
    onDone();
  };

  const handleNewThread = () => {
    void openNewThread(agent.id, workspaceId).then((threadId) => {
      if (!threadId) {
        return;
      }
      const thread = useThreadStore.getState().byId(threadId);
      if (thread) {
        openThread(thread);
      }
    });
  };

  const handleTogglePin = (thread: Thread) => {
    const next = thread.pinned !== true;
    void setThreadPinned(thread.id, next)
      .catch(() => null)
      .then((record) => {
        useThreadStore.getState().setPinned(thread.id, record ? record.pinned : next);
      });
  };

  const handleDelete = (thread: Thread) => {
    if (thread.kind !== 'chat') {
      return;
    }
    void confirmDeleteThread(thread).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      void deleteThreadRecord(thread.id)
        .catch(() => {})
        .finally(() => {
          useSessionStore.getState().removeForThreads([thread.id]);
          useThreadStore.getState().remove(thread.id);
          useIdeStore.getState().closeByEntity(workspaceId, 'thread', thread.id);
        });
    });
  };

  return (
    <div className="flex flex-col gap-0.5" data-testid="agent-threads-panel">
      <div className="flex items-center gap-0.5 px-0.5 pb-1 group-data-[collapsible=icon]:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-testid="agent-threads-back"
          title="Back to agents"
          onClick={() => back()}
        >
          <ChevronLeftIcon />
          <span className="sr-only">Back to agents</span>
        </Button>
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">{agent.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 px-1.5 text-xs"
          data-testid="agent-threads-new"
          onClick={handleNewThread}
        >
          New
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
          No threads yet.
        </p>
      ) : (
        sorted.map((thread) => (
          <AgentThreadRow
            key={thread.id}
            thread={thread}
            selected={activeThreadId === thread.id}
            onSelect={() => openThread(thread)}
            onPinToggle={thread.kind === 'chat' ? () => handleTogglePin(thread) : undefined}
            onDelete={thread.kind === 'chat' ? () => handleDelete(thread) : undefined}
          />
        ))
      )}
    </div>
  );
}
