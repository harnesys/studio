export type HostNodeStatus = 'ready' | 'unavailable';
export type WindowHostRecord = {
  id: string;
  name: string;
  baseUrl: string;
  credential: string;
};
export type PairingStartResponse = {
  code: string;
  expiresAt: string;
};
export type HostNetworkAddress = {
  address: string;
  scope: 'lan' | 'vpn' | 'external';
  iface?: string;
};
export type HostNetworkResponse = {
  port: number;
  mdnsName: string | null;
  addresses: HostNetworkAddress[];
};
export type PairingRedeemRequest = {
  code: string;
};
export type PairingRedeemResponse = {
  hostId: string;
  name: string;
  listen: string;
  credential: string;
};
export type WorkspaceRecord = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  color?: string | null;
  status?: HostNodeStatus;
};
export type IdeTabKind = 'thread' | 'file' | 'spawn' | 'diff' | 'schedule' | 'webhook' | 'terminal';
export type PersistedIdeTab = {
  id: string;
  kind: IdeTabKind;
  workspaceId: string;
  agentId?: string;
  threadId?: string;
  spawnId?: string;
  scheduleId?: string;
  webhookId?: string;
  terminalSessionId?: string;
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
export type WindowBootstrap = {
  hosts: WindowHostRecord[];
  desk: WindowDesk;
};
