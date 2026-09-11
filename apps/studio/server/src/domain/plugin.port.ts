import type { PluginName } from 'harnesys';

export type PluginInstallRecord = {
  name: PluginName;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  trusted: boolean;
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
  setTrusted(name: PluginName, trusted: boolean): PluginInstallRecord;
  setWorkspaceEnabled(name: PluginName, workspaceId: string, enabled: boolean): PluginInstallRecord;
};
