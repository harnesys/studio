import type { SessionEvent } from '@harnesys/studio-shared';
import { useShallow } from 'zustand/react/shallow';
import type { AgentStatus } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
export function useAgentLiveStatus(agentId: string): AgentStatus {
  const threads = useThreadStore(
    useShallow((state) => state.items.filter((item) => item.agentId === agentId)),
  );
  return useSessionStore((state) => {
    let running = false;
    for (const thread of threads) {
      if (state.activeRuns[thread.id] || thread.activeRunId) {
        running = true;
      }
      const events = state.events[thread.id];
      if (events !== undefined && isWaiting(events)) {
        return 'waiting';
      }
      if (!state.activeRuns[thread.id] && events !== undefined && hasRunningSession(events)) {
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
const waitingCache = new WeakMap<SessionEvent[], boolean>();
const runningCache = new WeakMap<SessionEvent[], boolean>();
export function isWaiting(events: SessionEvent[]): boolean {
  const cached = waitingCache.get(events);
  if (cached !== undefined) {
    return cached;
  }
  const result = computeWaiting(events);
  waitingCache.set(events, result);
  return result;
}

function computeWaiting(events: SessionEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
      continue;
    }
    if (TERMINAL_EVENT_TYPES.has(event.type)) {
      return false;
    }
    if (event.type === 'hitl.answer' || event.type === 'wait.resumed') {
      return false;
    }
    if (event.type === 'ask' || event.type === 'wait.started') {
      return true;
    }
  }
  return false;
}

function hasRunningSession(events: SessionEvent[]): boolean {
  const cached = runningCache.get(events);
  if (cached !== undefined) {
    return cached;
  }
  const result = events.length > 0 && !events.some((e) => TERMINAL_EVENT_TYPES.has(e.type));
  runningCache.set(events, result);
  return result;
}
