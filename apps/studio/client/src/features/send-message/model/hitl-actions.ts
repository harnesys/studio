import { useSessionStore } from '@/entities/session';
import { rejectRun, respondToRun } from '@/shared/api';

import { resumePausedThread } from './resume-paused';

export async function respondToAsk(
  threadId: string,
  askId: string,
  payload: unknown,
): Promise<void> {
  const runId = await ensureLiveRun(threadId);
  if (!runId) {
    throw new Error('No active run for this thread');
  }
  await respondToRun(runId, askId, payload);
}

export async function rejectAsk(threadId: string, askId: string, note?: string): Promise<void> {
  const runId = await ensureLiveRun(threadId);
  if (!runId) {
    throw new Error('No active run for this thread');
  }
  await rejectRun(runId, askId, note);
}

function ensureLiveRun(threadId: string): Promise<string | null> {
  const store = useSessionStore.getState();
  const existing = store.activeRuns[threadId];
  if (existing?.runId) {
    return Promise.resolve(existing.runId);
  }
  return resumePausedThread(threadId);
}
