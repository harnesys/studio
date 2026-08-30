import type { Snapshot, Event, SessionEvent } from 'harnesys';

export type { Snapshot, Event, SessionEvent };

export const THREAD_KINDS = ['chat', 'schedule'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

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

/** Accepted send: live agent entry id (= AgentRun.id). */
export type AcceptedRunResponse = {
  runId: string;
  status: 'accepted';
};

/** Manual `/compact`: stub response. */
export type CompactThreadResponse = {
  compacted: boolean;
};
