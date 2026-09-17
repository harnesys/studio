export type HostNodeRecord = {
  id: string;
  path: string;
  name: string;
};

export type HostNodeStatus = 'ready' | 'unavailable';

export type HostSection = {
  id: string;
  name: string;
  listen: string;
  token: string;
  /** Public base URL for webhook links (env PUBLIC_URL). */
  publicOrigin?: string;
  nodes: HostNodeRecord[];
};

export type WindowHostRecord = {
  id: string;
  name: string;
  baseUrl: string;
  credential: string;
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

/** Park payload: tabs + layout fields the client already keeps in IDE state. */
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

export type WindowSection = {
  hosts: WindowHostRecord[];
  desk: WindowDesk;
};

export type MachineConfig = {
  host: HostSection;
  window: WindowSection;
};

export type MachineConfigPort = {
  read(): MachineConfig;
  writeHost(patch: Partial<HostSection>): MachineConfig;
  writeWindow(patch: Partial<WindowSection>): MachineConfig;
};
