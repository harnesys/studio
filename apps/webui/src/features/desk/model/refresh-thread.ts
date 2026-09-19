import type { ThreadRecord } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getThread } from '@/shared/api';

const inflight = new Map<string, Promise<ThreadRecord | null>>();
export function refreshThread(threadId: string): Promise<ThreadRecord | null> {
  if (useSessionStore.getState().activeRuns[threadId]) {
    return Promise.resolve(null);
  }
  const running = inflight.get(threadId);
  if (running) {
    return running;
  }
  const task = getThread(threadId)
    .then((record) => {
      useThreadStore.getState().upsert(toClientThread(record));
      useSessionStore.getState().replaceEvents(record.id, record.events);
      return record;
    })
    .finally(() => {
      if (inflight.get(threadId) === task) {
        inflight.delete(threadId);
      }
    });
  inflight.set(threadId, task);
  return task;
}
