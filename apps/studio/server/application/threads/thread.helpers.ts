import type { ThreadRecord, ThreadSummary } from '../../../shared/types.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { Thread, ThreadRunMode } from '../../domain/thread.port.ts';

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

function isThreadRunMode(value: string): value is ThreadRunMode {
  return (
    value === 'ask' ||
    value === 'auto' ||
    value === 'dont_ask' ||
    value === 'bypass' ||
    value === 'plan'
  );
}

export function runModeFields(thread: Pick<Thread, 'metadata'>): { runMode?: ThreadRunMode } {
  const meta = thread.metadata;
  const mode =
    typeof meta === 'object' && meta !== null ? (meta as { runMode?: unknown }).runMode : undefined;
  if (typeof mode === 'string' && isThreadRunMode(mode)) {
    return { runMode: mode };
  }
  return {};
}

export function toSummary(thread: ThreadRecord): ThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    agentId: thread.agentId,
    originAgentId: thread.originAgentId,
    agentName: thread.agentName,
    workspaceId: thread.workspaceId,
    kind: thread.kind,
    parentThreadId: thread.parentThreadId,
    forkAt: thread.forkAt,
    inheritedEventCount: thread.inheritedEventCount,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastReadAt: thread.lastReadAt,
    unread: thread.unread,
    pinned: thread.pinned,
    runMode: thread.runMode,
  };
}
