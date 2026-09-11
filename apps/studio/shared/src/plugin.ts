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
  registryId?: string;
  catalogPluginName?: string;
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
  lspServerCount: number;
};

export type PluginMutationResponse = {
  plugin: PluginSummary;
  diagnostics: PluginLoadDiagnostic[];
};

export type PluginListItem = PluginMutationResponse;

export type InstallPluginRequest = {
  source?: string;
  path?: string;
  ref?: string;
  trust?: boolean;
  registryId?: string;
  catalogPluginName?: string;
  pluginName?: string;
};

export type PluginRegistryKind = 'claude-marketplace';

export type PluginRegistrySummary = {
  id: string;
  name: string;
  kind: PluginRegistryKind;
  source: string;
  path: string;
  revision?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type AddPluginRegistryRequest = {
  source: string;
  kind?: PluginRegistryKind;
};

export type CatalogInstallSource =
  | { type: 'relative'; path: string }
  | { type: 'github'; repo: string; ref?: string; sha?: string }
  | { type: 'url'; url: string; ref?: string; sha?: string }
  | { type: 'git-subdir'; url: string; path: string; ref?: string; sha?: string };

export type PluginCatalogEntry = {
  registryId: string;
  pluginName: string;
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  version?: string;
  homepage?: string;
  installable: boolean;
  unsupportedReason?: string;
  installSource?: CatalogInstallSource;
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
