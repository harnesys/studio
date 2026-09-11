import type { PluginLoadDiagnostic, PluginName, PluginSourceFormat } from 'harnesys';

export type { PluginLoadDiagnostic, PluginName, PluginSourceFormat } from 'harnesys';

export type PluginRecord = {
  name: PluginName;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  trusted: boolean;
  enabledWorkspaceIds: string[];
  installedAt: string;
  updatedAt: string;
};

export type PluginSummary = PluginRecord & {
  version?: string;
  description?: string;
  /** Present after a successful directory load. */
  sourceFormat?: PluginSourceFormat;
  skillCount: number;
  hookCount: number;
  mcpServerCount: number;
  agentCount: number;
  commandCount: number;
};

export type PluginMutationResponse = {
  plugin: PluginSummary;
  diagnostics: PluginLoadDiagnostic[];
};

export type PluginListItem = PluginMutationResponse;

export type InstallPluginRequest = {
  source: string;
  trust?: boolean;
};

export type TrustPluginRequest = {
  trusted: boolean;
};

export type EnableWorkspacePluginRequest = {
  enabled: boolean;
};

export type RemovePluginRequest = {
  deleteData?: boolean;
};
