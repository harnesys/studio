import type { AnswerInput, ConfirmDecision } from '@studio/shared';
import { useJournalStore } from '@/entities/journal';
import { answerRun, confirmRun } from '@/shared/api';

import { resumePausedThread } from './resume-paused';

export async function answerAsk(runId: string, stepId: string, input: AnswerInput) {
  await ensureLiveRun(runId);
  return answerRun(runId, stepId, input);
}

export async function confirmTool(runId: string, stepId: string, decision: ConfirmDecision) {
  await ensureLiveRun(runId);
  return confirmRun(runId, stepId, decision);
}

async function ensureLiveRun(runId: string): Promise<void> {
  const store = useJournalStore.getState();
  for (const active of Object.values(store.activeRuns)) {
    if (active.runId === runId) {
      return;
    }
  }
  const threadId = findThreadForRun(runId);
  if (!threadId) {
    return;
  }
  await resumePausedThread(threadId);
}

function findThreadForRun(runId: string): string | null {
  const journals = useJournalStore.getState().journals;
  for (const [threadId, journal] of Object.entries(journals)) {
    if (journal.entries.some((entry) => entry.id === runId)) {
      return threadId;
    }
  }
  return null;
}
