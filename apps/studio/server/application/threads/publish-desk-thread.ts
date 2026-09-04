import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';

const DEBOUNCE_MS = 150;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Last published state per thread; skips redundant full publishes. */
const published = new Map<string, { lastSeq: number; status: string }>();

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function statusOf(record: { activeRun: { status: string } | null }): string {
  return record.activeRun?.status ?? 'terminal';
}

/**
 * Publishes the thread to desk with a 150ms debounce.
 * Skip rule: when the built record carries the same lastSeq and both the previous
 * and current states are terminal, the desk already holds this content and the
 * publish is dropped (hot path: repeated publishes with no new events).
 */
export function publishDeskThread(
  getThread: GetThreadInput,
  deskEvents: DeskEventsPort,
  threadId: string,
): void {
  const existing = pending.get(threadId);
  if (existing !== undefined) {
    clearTimeout(existing);
  }
  pending.set(
    threadId,
    setTimeout(() => {
      pending.delete(threadId);
      void getThread
        .execute({ id: threadId })
        .then((thread) => {
          let lastSeq = 0;
          for (const event of thread.events) {
            if (event.seq !== undefined && event.seq > lastSeq) {
              lastSeq = event.seq;
            }
          }
          const status = statusOf(thread);
          const prev = published.get(threadId);
          if (
            prev !== undefined &&
            prev.lastSeq === lastSeq &&
            TERMINAL_STATUSES.has(prev.status) &&
            TERMINAL_STATUSES.has(status)
          ) {
            return;
          }
          published.set(threadId, { lastSeq, status });
          deskEvents.emit(thread.workspaceId, { type: 'thread', thread });
        })
        .catch(() => {
          // thread may already be gone
        });
    }, DEBOUNCE_MS),
  );
}
