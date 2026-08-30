import { getActiveThreadId, useThreadStore } from '@/entities/thread';
import { useStudioNavigation } from '@/shared/config/navigation';

import { useDeskStore } from './desk.store';

export function useOpenAgent() {
  const { openAgent, openThread } = useStudioNavigation();

  return (workspaceId: string, agentId: string) => {
    const storedThreadId = getActiveThreadId(agentId);
    const threads = useThreadStore.getState().forAgent(agentId);
    const target =
      (storedThreadId ? threads.find((t) => t.id === storedThreadId) : undefined) ??
      useThreadStore.getState().latestForAgent(agentId);

    if (target) {
      useDeskStore.getState().setFocusedThreadId(target.id);
      openThread(workspaceId, agentId, target.id);
    } else {
      useDeskStore.getState().setFocusedThreadId(null);
      openAgent(workspaceId, agentId);
    }
  };
}
