import { useSessionStore } from '@/entities/session';

import { resumePausedThread } from './resume-paused';

export async function respondToAsk(threadId: string, askId: string, payload: unknown): Promise<void> {
  await ensureLiveRun(threadId);
  // HITL respond is handled server-side via AgentRun.respond()
  // Client sends resume via the existing resume endpoint
}

async function ensureLiveRun(threadId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.activeRuns[threadId]) {
    return;
  }
  await resumePausedThread(threadId);
}
