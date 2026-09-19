import { DESK_PUBLISH_DEBOUNCE_MS, TERMINAL_RUN_STATUSES } from '../../config/constants.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const published = new Map<
  string,
  {
    lastSeq: number;
    status: string;
  }
>();
function statusOf(record: {
  activeRun: {
    status: string;
  } | null;
}): string {
  return record.activeRun?.status ?? 'terminal';
}
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
            TERMINAL_RUN_STATUSES.has(prev.status) &&
            TERMINAL_RUN_STATUSES.has(status)
          ) {
            return;
          }
          published.set(threadId, { lastSeq, status });
          deskEvents.emit(thread.workspaceId, { type: 'thread', thread });
        })
        .catch(() => {});
    }, DESK_PUBLISH_DEBOUNCE_MS),
  );
}
