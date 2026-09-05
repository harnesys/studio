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
  agentName: string;
  workspaceId: string;
  kind: ThreadKind;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  events: SessionEvent[];
  activeRun: ThreadActiveRun | null;
};

export type ThreadSummary = Pick<
  ThreadRecord,
  | 'id'
  | 'title'
  | 'agentId'
  | 'agentName'
  | 'workspaceId'
  | 'kind'
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'unread'
>;

/** Accepted send: queued run id from the journal. */
export type AcceptedRunResponse = {
  runId: string;
  status: 'queued';
};

/** Manual `/compact`: stub response. */
export type CompactThreadResponse = {
  compacted: boolean;
};
