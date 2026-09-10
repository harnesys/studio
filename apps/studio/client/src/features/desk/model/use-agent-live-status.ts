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
      if (state.activeRuns[threadId]) {
        running = true;
      }
      const events = state.events[threadId];
      if (events !== undefined && isWaiting(events)) {
        return 'waiting';
      }
      if (!state.activeRuns[threadId] && events !== undefined && hasRunningSession(events)) {
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

const TERMINAL_EVENT_TYPES = new Set([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

function isWaiting(events: SessionEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
      continue;
    }
    if (TERMINAL_EVENT_TYPES.has(event.type)) {
      return false;
    }
    if (event.type === 'hitl.answer') {
      return false;
    }
    if (event.type === 'ask') {
      return true;
    }
  }
  return false;
}

function hasRunningSession(events: SessionEvent[]): boolean {
  return events.length > 0 && !events.some((e) => TERMINAL_EVENT_TYPES.has(e.type));
}
