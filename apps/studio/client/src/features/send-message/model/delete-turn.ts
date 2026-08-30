import { useJournalStore } from '@/entities/journal';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { deleteThreadEntry } from '@/shared/api';

export async function deleteTurn(threadId: string, entryId: string): Promise<void> {
  const record = await deleteThreadEntry(threadId, entryId);
  useThreadStore.getState().upsert(toClientThread(record));
  useJournalStore.getState().replaceJournal(record.id, record.journal);
}
