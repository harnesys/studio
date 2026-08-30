import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';

export function publishDeskThread(
  getThread: GetThreadInput,
  deskEvents: DeskEventsPort,
  threadId: string,
): void {
  void getThread
    .execute({ id: threadId })
    .then((thread) => {
      deskEvents.emit(thread.workspaceId, { type: 'thread', thread });
    })
    .catch(() => {
      // thread may already be gone
    });
}
