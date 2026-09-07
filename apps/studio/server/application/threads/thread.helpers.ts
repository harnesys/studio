import type { ThreadRecord, ThreadSummary } from '../../../shared/types.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { Thread } from '../../domain/thread.port.ts';

export function requireThread(threads: ThreadRecord[], id: string): ThreadRecord {
  const found = threads.find((item) => item.id === id);
  if (!found) {
    throw new NotFoundError('thread not found');
  }
  return found;
}

export function isThreadUnread(updatedAt: string, lastReadAt: string): boolean {
  return updatedAt > lastReadAt;
}

export function readFields(thread: Pick<Thread, 'updatedAt' | 'lastReadAt'>): {
  lastReadAt: string;
  unread: boolean;
} {
  return {
    lastReadAt: thread.lastReadAt,
    unread: isThreadUnread(thread.updatedAt, thread.lastReadAt),
  };
}

export function pinnedFields(thread: Pick<Thread, 'metadata'>): { pinned: boolean } {
  const meta = thread.metadata;
  return {
    pinned:
      typeof meta === 'object' && meta !== null && (meta as { pinned?: unknown }).pinned === true,
  };
}

export function toSummary(thread: ThreadRecord): ThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    agentId: thread.agentId,
    agentName: thread.agentName,
    workspaceId: thread.workspaceId,
    kind: thread.kind,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastReadAt: thread.lastReadAt,
    unread: thread.unread,
    pinned: thread.pinned,
  };
}
