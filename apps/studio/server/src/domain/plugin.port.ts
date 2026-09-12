import type { GrantClass, PluginName } from '@harnesys/studio-shared';

export type PluginInstallFormat = 'agent-plugins' | 'claude-compat' | 'unknown';

export type PluginGrants = Partial<Record<GrantClass, boolean>>;

export type PluginOptionValue = string | number | boolean;

export type PluginInstallRecord = {
  name: PluginName;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  format: PluginInstallFormat;
  grants: Record<string, PluginGrants>;
  options: Record<string, PluginOptionValue>;
  enabledWorkspaceIds: string[];
  registryId?: string;
  catalogPluginName?: string;
  installedAt: string;
  updatedAt: string;
};

export type PluginRepository = {
  list(): PluginInstallRecord[];
  findByName(name: PluginName): PluginInstallRecord | undefined;
  upsert(rec: PluginInstallRecord): PluginInstallRecord;
  delete(name: PluginName): void;
  setGrants(workspaceId: string, name: PluginName, classes: GrantClass[]): PluginInstallRecord;
  setOption(name: PluginName, key: string, value: PluginOptionValue): PluginInstallRecord;
  approveServer(name: PluginName, serverId: string): void;
  approvals(name: PluginName): string[];
  setWorkspaceEnabled(name: PluginName, workspaceId: string, enabled: boolean): PluginInstallRecord;
};
