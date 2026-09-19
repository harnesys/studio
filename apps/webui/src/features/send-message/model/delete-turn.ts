import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { deleteThreadEntry } from '@/shared/api';
export async function deleteTurn(threadId: string, entryId: string): Promise<void> {
  const record = await deleteThreadEntry(threadId, entryId);
  useThreadStore.getState().upsert(toClientThread(record));
  useSessionStore.getState().replaceEvents(record.id, record.events);
}
