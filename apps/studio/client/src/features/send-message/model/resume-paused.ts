import { isAgentEntry } from '@studio/shared';
import { useJournalStore } from '@/entities/journal';
import { resumeThread } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

import { drainRunStream } from './drain-run-stream';

/** Cold-start: resume paused agent entry and attach SSE until terminal. */
export async function resumePausedThread(threadId: string): Promise<string | null> {
  const store = useJournalStore.getState();
  const journal = store.journalOf(threadId);
  const agent = [...journal.entries].reverse().find(isAgentEntry);
  if (agent?.status !== 'paused') {
    return null;
  }
  if (store.runIdOf(threadId) === agent.id) {
    return agent.id;
  }

  const controller = new AbortController();
  store.startRun(threadId, controller);

  let runId: string;
  try {
    const accepted = await resumeThread(threadId);
    runId = accepted.runId;
    store.replaceJournal(threadId, accepted.journal);
    store.setRunId(threadId, runId);
    trace('client', 'resume accepted', { runId });
  } catch (error) {
    store.finishRun(threadId);
    throw error;
  }

  void drainRunStream(threadId, runId, controller);
  return runId;
}
