import type { SessionEvent } from '@harnesys/studio-shared';

let pendingByThread = new Map<string, SessionEvent[]>();
export function enqueuePending(threadId: string, event: SessionEvent): void {
  const buf = pendingByThread.get(threadId);
  if (buf) {
    buf.push(event);
    return;
  }
  pendingByThread.set(threadId, [event]);
}
export function takePending(): Map<string, SessionEvent[]> {
  if (pendingByThread.size === 0) {
    return pendingByThread;
  }
  const out = pendingByThread;
  pendingByThread = new Map();
  return out;
}
export function hasPending(): boolean {
  return pendingByThread.size > 0;
}
export function dropPendingThreads(threadIds: string[]): void {
  for (const id of threadIds) {
    pendingByThread.delete(id);
  }
}
let epochTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleEpochFlush(flush: () => void, ms: number): void {
  if (epochTimer !== undefined) {
    return;
  }
  epochTimer = setTimeout(() => {
    epochTimer = undefined;
    flush();
  }, ms);
}
export function cancelEpochFlush(): void {
  if (epochTimer === undefined) {
    return;
  }
  clearTimeout(epochTimer);
  epochTimer = undefined;
}
