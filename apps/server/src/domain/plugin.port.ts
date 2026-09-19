import type { GrantClass, PluginName } from '@harnesys/studio-shared';

export type PluginInstallFormat = 'agent-plugins' | 'claude-compat' | 'unknown';

export type PluginGrants = Partial<Record<GrantClass, boolean>>;

export type PluginOptionValue = string | number | boolean;

export type PluginInstallRecord = {
  workspaceId: string;
  name: PluginName;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  format: PluginInstallFormat;
  grants: PluginGrants;
  options: Record<string, PluginOptionValue>;
  registryId?: string;
  catalogPluginName?: string;
  installedAt: string;
  updatedAt: string;
};

export type PluginRepository = {
  list(workspaceId: string): PluginInstallRecord[];
  /** All install rows across nodes (catalog decorate / dependency scans). */
  listAll(): PluginInstallRecord[];
  findByName(workspaceId: string, name: PluginName): PluginInstallRecord | undefined;
  /** First install of this name on any node (host-wide catalog decorate). */
  findByNameAny(name: PluginName): PluginInstallRecord | undefined;
  upsert(rec: PluginInstallRecord): PluginInstallRecord;
  delete(workspaceId: string, name: PluginName): void;
  setGrants(workspaceId: string, name: PluginName, classes: GrantClass[]): PluginInstallRecord;
  setOption(
    workspaceId: string,
    name: PluginName,
    key: string,
    value: PluginOptionValue,
  ): PluginInstallRecord;
  approveServer(workspaceId: string, name: PluginName, serverId: string): void;
  approvals(workspaceId: string, name: PluginName): string[];
  setServerDisabled(
    name: PluginName,
    serverId: string,
    workspaceId: string,
    disabled: boolean,
  ): void;
  isServerDisabled(name: PluginName, serverId: string, workspaceId: string): boolean;
  listDisabledServers(workspaceId: string): PluginServerDisable[];
};

export type PluginServerDisable = {
  pluginName: PluginName;
  serverId: string;
};
