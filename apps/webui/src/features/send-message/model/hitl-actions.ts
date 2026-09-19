import { useSessionStore } from '@/entities/session';
import { ApiError, retryRun as retryRunRequest } from '@/shared/api';
import { connectThreadRun, getClientForRun, type RunStreamClient } from './client-registry';

function rootRunClient(threadId: string): RunStreamClient | undefined {
  const runId = useSessionStore.getState().activeRuns[threadId]?.runId;
  return runId ? getClientForRun(threadId, runId, true) : undefined;
}
export async function respondToAsk(
  threadId: string,
  askId: string,
  payload: unknown,
): Promise<void> {
  await rootRunClient(threadId)?.respond(askId, payload, { clientEventId: crypto.randomUUID() });
}
export async function rejectAsk(threadId: string, askId: string, note?: string): Promise<void> {
  await rootRunClient(threadId)?.reject(askId, note, { clientEventId: crypto.randomUUID() });
}
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
