export type ThreadKind = 'chat' | 'schedule' | 'webhook';
export type Thread = {
  id: string;
  workspaceId: string;
  agentId: string;
  originAgentId: string;
  title: string;
  kind: ThreadKind;
  parentThreadId?: string | null;
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
export type ThreadRunMode = string;
export type ThreadRepository = {
  listByWorkspace(workspaceId: string): Thread[];
  findById(id: string): Thread | undefined;
  insert(rec: ThreadInsert): Thread;
  patch(id: string, patch: ThreadPatch): Thread;
  updateTitle(id: string, title: string): Thread;
  setRunMode(id: string, mode: ThreadRunMode): Thread;
  setPinned(id: string, pinned: boolean): Thread;
  markRead(id: string): Thread;
  touch(id: string): void;
  delete(id: string): void;
  deleteByAgent(agentId: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
