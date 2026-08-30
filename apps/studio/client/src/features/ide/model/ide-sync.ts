import { useEffect } from 'react';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { useIdeStore } from './ide.store';

export function useIdeSync() {
  const { workspaceId, agentId, threadId, scheduleId, webhookId } = useStudioLocation();

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    if (threadId && agentId) {
      const thread = useThreadStore.getState().byId(threadId);
      if (thread) {
        useIdeStore.getState().openThread(workspaceId, agentId, threadId);
        useDeskStore.getState().setFocusedThreadId(threadId);
        setActiveThreadId(agentId, threadId);
      }
    } else if (agentId && !threadId) {
      const latest = useThreadStore.getState().latestForAgent(agentId);
      if (latest) {
        useIdeStore.getState().openThread(workspaceId, agentId, latest.id);
        useDeskStore.getState().setFocusedThreadId(latest.id);
        setActiveThreadId(agentId, latest.id);
      }
    }
    if (scheduleId) {
      useIdeStore.getState().openSchedule(workspaceId, scheduleId);
    }
    if (webhookId) {
      useIdeStore.getState().openWebhook(workspaceId, webhookId);
    }
  }, [workspaceId, agentId, threadId, scheduleId, webhookId]);
}
