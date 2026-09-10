import type { SessionEvent } from '@studio/shared';

let pendingByThread = new Map<string, SessionEvent[]>();
let scheduled = false;

export function enqueuePending(threadId: string, event: SessionEvent): void {
  const buf = pendingByThread.get(threadId);
  if (buf) {
    buf.push(event);
    return;
  }
  pendingByThread.set(threadId, [event]);
}

export function takePending(): Map<string, SessionEvent[]> {
  scheduled = false;
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

/** Склеивает дельты до следующего кадра; повторный вызов до flush — no-op. */
export function schedulePendingFrame(flush: () => void): void {
  if (scheduled) {
    return;
  }
  scheduled = true;
  const run = () => {
    scheduled = false;
    flush();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
    return;
  }
  setTimeout(run, 16);
}
