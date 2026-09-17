export type HostNodeStatus = 'ready' | 'unavailable';

export type WorkspaceRecord = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  status?: HostNodeStatus;
};

export type IdeTabKind = 'thread' | 'file' | 'spawn' | 'diff' | 'schedule' | 'webhook';

export type PersistedIdeTab = {
  id: string;
  kind: IdeTabKind;
  workspaceId: string;
  agentId?: string;
  threadId?: string;
  spawnId?: string;
  scheduleId?: string;
  webhookId?: string;
  path?: string;
  dirty?: boolean;
};

export type PersistedIdeGroup = {
  id: string;
  tabIds: string[];
  activeId: string | null;
};

export type PersistedIdeWorkspace = {
  tabs: PersistedIdeTab[];
  activeId: string | null;
  activeGroupId?: string | null;
  groups?: PersistedIdeGroup[];
  layout?: unknown;
};

export type WindowDeskPark = Record<string, PersistedIdeWorkspace>;

export type WindowDesk = {
  selectedNodeIds: string[];
  park: WindowDeskPark;
};
