import { useSessionStore } from '@/entities/session';
import { resumeThread } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

import { drainRunStream } from './drain-run-stream';

export async function resumePausedThread(threadId: string): Promise<string | null> {
  const store = useSessionStore.getState();
  const events = store.eventsOf(threadId);
  const hasPendingAsk =
    events.some((ev) => ev.type === 'ask') &&
    !events.some((ev) => ev.type === 'done' || ev.type === 'error');

  if (!hasPendingAsk) {
    return null;
  }

  const controller = new AbortController();
  store.startRun(threadId, controller);

  let runId: string;
  try {
    const accepted = await resumeThread(threadId);
    runId = accepted.runId;
    store.setRunId(threadId, runId);
    trace('client', 'resume accepted', { runId });
  } catch (error) {
    store.finishRun(threadId);
    throw error;
  }

  void drainRunStream(threadId, runId, controller);
  return runId;
}
