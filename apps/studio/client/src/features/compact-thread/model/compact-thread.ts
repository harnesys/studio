import type { CompactThreadResponse, SessionEvent } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { compactThreadStream, getThread, readSse } from '@/shared/api';

import { useCompactingStore } from './compacting.store';

export type CompactThreadOptions = {
  threadId: string;
};

export type CompactThreadResult = {
  compacted: boolean;
};

export async function compactThread(options: CompactThreadOptions): Promise<CompactThreadResult> {
  const { threadId } = options;
  const controller = new AbortController();
  useCompactingStore.getState().begin(threadId);
  let result: CompactThreadResponse = { compacted: false };
  try {
    const response = await compactThreadStream(threadId, controller.signal);
    for await (const frame of readSse(response)) {
      if (frame.event === 'compact.result') {
        result = JSON.parse(frame.data) as CompactThreadResponse;
        continue;
      }
      if (frame.event === 'error') {
        const body = JSON.parse(frame.data) as { message?: string };
        throw new Error(body.message || 'Compact failed');
      }
      const event = JSON.parse(frame.data) as SessionEvent;
      useSessionStore.getState().appendEvent(threadId, event);
    }
    useThreadStore.getState().touch(threadId);
    try {
      const record = await getThread(threadId);
      useThreadStore.getState().upsert(toClientThread(record));
      useSessionStore.getState().reconcileEvents(threadId, record.events);
    } catch {
      // live events already in the store
    }
    return { compacted: result.compacted };
  } finally {
    useCompactingStore.getState().end(threadId);
  }
}
