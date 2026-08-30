import { isAgentEntry } from '@studio/shared';
import { useJournalStore } from '@/entities/journal';

import { drainRunStream } from './drain-run-stream';
import { resumePausedThread } from './resume-paused';

/** Attach to a server-side run that this client did not start. */
export async function followLiveThread(threadId: string): Promise<void> {
  const store = useJournalStore.getState();
  if (store.activeRuns[threadId]) {
    return;
  }
  const journal = store.journalOf(threadId);
  const agent = [...journal.entries].reverse().find(isAgentEntry);
  if (!agent) {
    return;
  }
  if (agent.status === 'paused') {
    await resumePausedThread(threadId);
    return;
  }
  if (agent.status !== 'running') {
    return;
  }

  const controller = new AbortController();
  store.startRun(threadId, controller, agent.id);
  await drainRunStream(threadId, agent.id, controller);
}
