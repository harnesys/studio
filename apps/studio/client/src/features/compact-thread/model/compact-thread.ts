import { useJournalStore } from '@/entities/journal';
import { useThreadStore } from '@/entities/thread';
import { compactThread as compactThreadRequest } from '@/shared/api';

import { useCompactingStore } from './compacting.store';

export type CompactThreadOptions = {
  threadId: string;
};

export type CompactThreadResult = {
  compacted: boolean;
};

export async function compactThread(options: CompactThreadOptions): Promise<CompactThreadResult> {
  const { threadId } = options;
  useCompactingStore.getState().begin(threadId);
  try {
    const response = await compactThreadRequest(threadId);
    useJournalStore.getState().replaceJournal(threadId, response.journal);
    useThreadStore.getState().touch(threadId);
    return { compacted: response.compacted };
  } finally {
    useCompactingStore.getState().end(threadId);
  }
}
