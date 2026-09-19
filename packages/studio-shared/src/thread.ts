import type { Event, RunLifecycleStatus, SessionEvent, SessionEventType, Snapshot } from 'harnesys';

export type { Event, SessionEvent, SessionEventType, Snapshot };
export const THREAD_KINDS = ['chat', 'schedule', 'webhook'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];
export type ThreadActiveRun = {
  runId: string;
  status: RunLifecycleStatus;
  leaseExpired?: boolean;
};
export type ThreadRecord = {
  id: string;
  title: string;
  agentId: string;
  originAgentId: string;
  agentName: string;
  workspaceId: string;
  kind: ThreadKind;
  parentThreadId: string | null;
  forkAt: string | null;
  inheritedEventCount: number;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  pinned: boolean;
  runMode?: string;
  events: SessionEvent[];
  activeRun: ThreadActiveRun | null;
};
export type ThreadAgentRef = {
  agentId: string;
  originAgentId: string;
};
export type ThreadSummary = Pick<
  ThreadRecord,
  | 'id'
  | 'title'
  | 'agentId'
  | 'originAgentId'
  | 'agentName'
  | 'workspaceId'
  | 'kind'
  | 'parentThreadId'
  | 'forkAt'
  | 'inheritedEventCount'
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'unread'
  | 'pinned'
  | 'runMode'
  | 'activeRun'
>;
export function threadsForAgent<T extends ThreadAgentRef>(
  threads: readonly T[],
  agentId: string,
): T[] {
  return threads.filter((thread) => thread.originAgentId === agentId || thread.agentId === agentId);
}
export type AcceptedRunResponse = {
  runId: string;
  status: 'queued';
};
export type CompactThreadResponse =
  | {
      compacted: true;
      id: string;
      coveredFrom: number;
      coveredUntil: number;
      tokensBefore: number;
      tokensAfter: number;
    }
  | {
      compacted: false;
    };
