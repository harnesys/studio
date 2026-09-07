import type { Event, RunLifecycleStatus, SessionEvent, Snapshot } from 'harnesys';

export type { Event, SessionEvent, Snapshot };

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
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  pinned: boolean;
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
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'unread'
  | 'pinned'
>;

/** Threads where the agent is origin or current speaker. */
export function threadsForAgent<T extends ThreadAgentRef>(
  threads: readonly T[],
  agentId: string,
): T[] {
  return threads.filter((thread) => thread.originAgentId === agentId || thread.agentId === agentId);
}

/** Accepted send: queued run id from the journal. */
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
  | { compacted: false };
