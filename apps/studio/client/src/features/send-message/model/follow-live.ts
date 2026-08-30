import type { SessionEvent } from '@studio/shared';
import { useSessionStore } from '@/entities/session';

import { drainRunStream } from './drain-run-stream';
import { resumePausedThread } from './resume-paused';

export async function followLiveThread(threadId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.activeRuns[threadId]) {
    return;
  }
  const events = store.eventsOf(threadId);
  const lastRunEvent = findLastRunEvent(events);
  if (!lastRunEvent) {
    return;
  }

  if (lastRunEvent.type === 'ask') {
    await resumePausedThread(threadId);
    return;
  }
  if (lastRunEvent.type === 'text-delta' || lastRunEvent.type === 'tool') {
    // Run is still streaming — attach drain
    const runId = store.runIdOf(threadId);
    if (!runId) return;
    const controller = new AbortController();
    store.startRun(threadId, controller, runId);
    await drainRunStream(threadId, runId, controller);
    return;
  }
}

function findLastRunEvent(events: SessionEvent[]): SessionEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'done' || ev.type === 'error') return undefined;
    if (ev.type === 'text-delta' || ev.type === 'tool' || ev.type === 'ask') return ev;
  }
  return undefined;
}
