import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';

const DEBOUNCE_MS = 150;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

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
          deskEvents.emit(thread.workspaceId, { type: 'thread', thread });
        })
        .catch(() => {
          // thread may already be gone
        });
    }, DEBOUNCE_MS),
  );
}
