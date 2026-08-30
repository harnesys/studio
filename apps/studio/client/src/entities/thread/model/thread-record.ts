import type { ThreadRecord, ThreadSummary } from '@studio/shared';

import type { Thread } from './thread';

export function toClientThread(record: ThreadSummary | ThreadRecord): Thread {
  return {
    id: record.id,
    agentId: record.agentId,
    workspaceId: record.workspaceId,
    title: record.title,
    kind: record.kind,
    updatedAt: record.updatedAt,
    unread: record.unread,
  };
}
