import { toClientThread, useThreadStore } from '@/entities/thread';
import { markThreadRead as markThreadReadRequest } from '@/shared/api';

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
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
  } finally {
    inFlight.delete(threadId);
  }
}
