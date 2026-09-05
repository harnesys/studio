import type { ThreadRecord } from '@studio/shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getThread } from '@/shared/api';

export async function refreshThread(threadId: string): Promise<ThreadRecord | null> {
  if (useSessionStore.getState().activeRuns[threadId]) {
    return null;
  }
  const record = await getThread(threadId);
  useThreadStore.getState().upsert(toClientThread(record));
  useSessionStore.getState().replaceEvents(record.id, record.events);
  return record;
}
