import { useNavigate } from 'react-router';
import { useSessionStore } from '@/entities/session';
import { setActiveThreadId, type Thread, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord, setThreadPinned } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';

export function useThreadActions(workspaceId: string) {
  const navigate = useNavigate();

  const openThread = (thread: Thread) => {
    useIdeStore.getState().openThread(workspaceId, thread.agentId, thread.id);
    useDeskStore.getState().setFocusedThreadId(thread.id);
    setActiveThreadId(thread.agentId, thread.id);
    void navigate(studioPath.thread(workspaceId, thread.id, { kind: 'agent', id: thread.agentId }));
  };

  const createThread = (agentId: string) => {
    void openNewThread(agentId, workspaceId).then((threadId) => {
      if (!threadId) {
        return;
      }
      const thread = useThreadStore.getState().byId(threadId);
      if (thread) {
        openThread(thread);
      }
    });
  };

  const togglePin = (thread: Thread) => {
    const next = thread.pinned !== true;
    void setThreadPinned(thread.id, next)
      .catch(() => null)
      .then((record) => {
        useThreadStore.getState().setPinned(thread.id, record ? record.pinned : next);
      });
  };

  const removeThread = (thread: Thread) => {
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

  return { openThread, createThread, togglePin, removeThread };
}
