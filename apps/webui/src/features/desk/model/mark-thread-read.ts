import { toClientThread, useThreadStore } from '@/entities/thread';
import { markThreadRead as markThreadReadRequest } from '@/shared/api';

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();

/** Debounced server mark-read while the transcript stays at the bottom edge.
 *  Skipped entirely when the thread is already read: the caller fires on every
 *  scroll/content tick, and each request used to carry the full thread record. */
export function scheduleMarkThreadRead(threadId: string): void {
  const store = useThreadStore.getState();
  if (!store.byId(threadId)?.unread) {
    return;
  }
  store.markRead(threadId);
  const existing = pending.get(threadId);
  if (existing) {
    clearTimeout(existing);
  }
  pending.set(
    threadId,
    setTimeout(() => {
      pending.delete(threadId);
      void flushMarkThreadRead(threadId);
    }, 250),
  );
}

async function flushMarkThreadRead(threadId: string): Promise<void> {
  if (inFlight.has(threadId)) {
    return;
  }
  inFlight.add(threadId);
  try {
    const record = await markThreadReadRequest(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
  } catch {
    // Keep optimistic markRead; next hydrate/reconcile will correct.
  } finally {
    inFlight.delete(threadId);
  }
}
