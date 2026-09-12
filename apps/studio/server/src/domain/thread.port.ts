export type ThreadKind = 'chat' | 'schedule' | 'webhook';

export type Thread = {
  id: string;
  workspaceId: string;
  /** Current speaker: RunTargets / next send. */
  agentId: string;
  /** Who opened the thread; stable for lists and «opened by». */
  originAgentId: string;
  title: string;
  kind: ThreadKind;
  /** Branch: parent conversation. */
  parentThreadId?: string | null;
  /** Branch: journal/session event id (or message id) where the fork starts. */
  forkAt?: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
};

export type ThreadInsert = Thread;

export type ThreadPatch = Partial<{
  agentId: string;
  title: string;
  kind: ThreadKind;
  metadata: unknown;
}>;
/** Mode id of the agent's modes; resolved by the chain in shared resolveModeId. */
export type ThreadRunMode = string;
export type ThreadRepository = {
  listByWorkspace(workspaceId: string): Thread[];
  findById(id: string): Thread | undefined;
  insert(rec: ThreadInsert): Thread;
  patch(id: string, patch: ThreadPatch): Thread;
  updateTitle(id: string, title: string): Thread;
  /** Store the run mode in thread metadata. Read back by StudioRunTargets. */
  setRunMode(id: string, mode: ThreadRunMode): Thread;
  /** Toggle the pinned flag in thread metadata. Does not bump updatedAt. */
  setPinned(id: string, pinned: boolean): Thread;
  /** Set lastReadAt to the thread's current updatedAt (unread → false). */
  markRead(id: string): Thread;
  touch(id: string): void;
  delete(id: string): void;
  deleteByAgent(agentId: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
