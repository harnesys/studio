import type { ThreadRecord, ThreadSummary } from '@harnesys/studio-shared';
import { isModeId } from '@harnesys/studio-shared';
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
export function pinnedFields(thread: Pick<Thread, 'metadata'>): {
  pinned: boolean;
} {
  const meta = thread.metadata;
  return {
    pinned:
      typeof meta === 'object' &&
      meta !== null &&
      (
        meta as {
          pinned?: unknown;
        }
      ).pinned === true,
  };
}
export function runModeFields(thread: Pick<Thread, 'metadata'>): {
  runMode?: string;
} {
  const meta = thread.metadata;
  const mode =
    typeof meta === 'object' && meta !== null
      ? (
          meta as {
            runMode?: unknown;
          }
        ).runMode
      : undefined;
  if (typeof mode === 'string' && isModeId(mode)) {
    return { runMode: mode };
  }
  return {};
}
export function injectedRunModeField(thread: Pick<Thread, 'metadata'>): string | null {
  const meta = thread.metadata;
  const mode =
    typeof meta === 'object' && meta !== null
      ? (
          meta as {
            injectedRunMode?: unknown;
          }
        ).injectedRunMode
      : undefined;
  return typeof mode === 'string' && isModeId(mode) ? mode : null;
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
    activeRun: thread.activeRun,
  };
}
