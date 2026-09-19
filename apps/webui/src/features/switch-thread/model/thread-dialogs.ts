import type { Thread } from '@/entities/thread';
import { alert } from '@/shared/services/overlay';

export function confirmDeleteThread(thread: Thread) {
  return alert.confirm({
    title: `Delete ${thread.title}?`,
    description: 'Messages and history for this thread will be permanently deleted.',
    confirmText: 'Delete thread',
    variant: 'destructive',
    testId: 'delete-thread-dialog',
  });
}
