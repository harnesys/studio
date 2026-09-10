import type { ThreadRecord, ThreadSummary } from '@studio/shared';

import type { Thread } from './thread';

export function toClientThread(record: ThreadSummary | ThreadRecord): Thread {
  return {
    id: record.id,
    agentId: record.agentId,
    originAgentId: record.originAgentId,
    workspaceId: record.workspaceId,
    title: record.title,
    kind: record.kind,
    parentThreadId: record.parentThreadId,
    forkAt: record.forkAt,
    inheritedEventCount: record.inheritedEventCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    unread: record.unread,
    runMode: record.runMode,
    activeRunId: 'activeRun' in record ? (record.activeRun?.runId ?? null) : null,
  };
}
