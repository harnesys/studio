import type { SessionEvent } from '@studio/shared';
import { useShallow } from 'zustand/react/shallow';
import type { AgentStatus } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';

export function useAgentLiveStatus(agentId: string): AgentStatus {
  const threadIds = useThreadStore(
    useShallow((state) =>
      state.items.filter((item) => item.agentId === agentId).map((item) => item.id),
    ),
  );
  return useSessionStore((state) => {
    let running = false;
    for (const threadId of threadIds) {
      const events = state.events[threadId] ?? [];
      if (isWaiting(events)) {
        return 'waiting';
      }
      if (state.activeRuns[threadId] || hasRunningSession(events)) {
        running = true;
      }
    }
    return running ? 'running' : 'idle';
  });
}

export function useAgentHasUnread(agentId: string): boolean {
  return useThreadStore((state) => state.hasUnreadForAgent(agentId));
}

export function useThreadWaiting(threadId: string | null): boolean {
  return useSessionStore((state) => {
    if (!threadId) {
      return false;
    }
    return isWaiting(state.events[threadId] ?? []);
  });
}

function isWaiting(events: SessionEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'done' || event.type === 'error') {
      return false;
    }
    if (event.type === 'ask') {
      return true;
    }
  }
  return false;
}

function hasRunningSession(events: SessionEvent[]): boolean {
  return events.length > 0 && !events.some((e) => e.type === 'done' || e.type === 'error');
}
