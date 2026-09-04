import { ApiError, retryRun as retryRunRequest } from '@/shared/api';

import { connectThreadRun, getClient } from './client-registry';

export async function respondToAsk(
  threadId: string,
  askId: string,
  payload: unknown,
): Promise<void> {
  await getClient(threadId).respond(askId, payload, { clientEventId: crypto.randomUUID() });
}

export async function rejectAsk(threadId: string, askId: string, note?: string): Promise<void> {
  await getClient(threadId).reject(askId, note, { clientEventId: crypto.randomUUID() });
}

/** Requeues a failed run, then reconnects the tail. 409 (already queued) just reconnects. */
export async function retryRun(threadId: string, runId: string): Promise<void> {
  try {
    await retryRunRequest(runId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) {
      throw error;
    }
  }
  connectThreadRun(threadId, runId);
}
