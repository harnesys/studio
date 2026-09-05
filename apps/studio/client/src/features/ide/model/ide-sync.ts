import { useEffect } from 'react';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { useIdeStore } from './ide.store';

export function useIdeSync() {
  const { workspaceId, threadId, filePath } = useStudioLocation();

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    if (threadId) {
      const thread = useThreadStore.getState().byId(threadId);
      if (thread) {
        useIdeStore.getState().openThread(workspaceId, thread.agentId, threadId);
        useDeskStore.getState().setFocusedThreadId(threadId);
        setActiveThreadId(thread.agentId, threadId);
      }
    }
    if (filePath) {
      useIdeStore.getState().openFile(workspaceId, filePath);
    }
  }, [workspaceId, threadId, filePath]);
}
