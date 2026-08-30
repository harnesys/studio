import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getThread } from '@/shared/api';

export async function refreshThread(threadId: string): Promise<void> {
  if (useSessionStore.getState().activeRuns[threadId]) {
    return;
  }
  const record = await getThread(threadId);
  useThreadStore.getState().upsert(toClientThread(record));
  useSessionStore.getState().replaceEvents(record.id, record.events);
}
