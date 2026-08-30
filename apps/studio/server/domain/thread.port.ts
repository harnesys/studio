export type ThreadKind = 'chat' | 'schedule';

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
export type ThreadRepository = {
  listByWorkspace(workspaceId: string): Thread[];
  findById(id: string): Thread | undefined;
  insert(rec: ThreadInsert): Thread;
  updateTitle(id: string, title: string): Thread;
  /** Set lastReadAt to the thread's current updatedAt (unread → false). */
  markRead(id: string): Thread;
  touch(id: string): void;
  delete(id: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
