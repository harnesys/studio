export type ThreadKind = 'chat' | 'schedule' | 'webhook';

export type Thread = {
  id: string;
  workspaceId: string;
  agentId: string;
  title: string;
  kind: ThreadKind;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
};

export type ThreadInsert = Thread;

export type ThreadPatch = Partial<{
  title: string;
  kind: ThreadKind;
  metadata: unknown;
}>;
export type ThreadRunMode = 'ask' | 'auto' | 'dont_ask' | 'bypass' | 'plan';
export type ThreadRepository = {
  listByWorkspace(workspaceId: string): Thread[];
  findById(id: string): Thread | undefined;
  insert(rec: ThreadInsert): Thread;
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
