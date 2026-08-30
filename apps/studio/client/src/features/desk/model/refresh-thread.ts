import { useJournalStore } from '@/entities/journal';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getThread } from '@/shared/api';

export async function refreshThread(threadId: string): Promise<void> {
  if (useJournalStore.getState().activeRuns[threadId]) {
    return;
  }
  const record = await getThread(threadId);
  useThreadStore.getState().upsert(toClientThread(record));
  useJournalStore.getState().replaceJournal(record.id, record.journal);
}
