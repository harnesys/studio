import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useStudioNavigation } from '@/shared/config/navigation';

import { useDeskStore } from './desk.store';

export function useSelectThread() {
  const { openThread } = useStudioNavigation();

  return (workspaceId: string, agentId: string, threadId: string) => {
    const thread = useThreadStore.getState().byId(threadId);
    if (!thread || thread.agentId !== agentId) {
      return;
    }
    useDeskStore.getState().setFocusedThreadId(thread.id);
    setActiveThreadId(agentId, thread.id);
    openThread(workspaceId, agentId, thread.id);
  };
}
