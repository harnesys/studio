import type {
  ComponentSource,
  ComponentStatus,
  PluginDiagnostic,
  PluginKind,
  PluginName,
  PluginSourceFormat,
} from 'harnesys';

export type {
  ComponentSource,
  ComponentStatus,
  PluginDiagnostic,
  PluginKind,
  PluginName,
  PluginSourceFormat,
} from 'harnesys';

export type GrantClass = 'content' | 'process' | 'network';

export type PluginGrantSelection = Partial<Record<GrantClass, boolean>>;

/** Granted classes per workspace id, as stored on the plugin record. */
export type PluginGrantsMap = Record<string, PluginGrantSelection>;

export type PluginOptionValue = string | number | boolean;

export type PluginRecord = {
  name: PluginName;
  source: string;
  revision: string;
  path: string;
  dataPath: string;
  format: PluginSourceFormat | 'unknown';
  grants: PluginGrantsMap;
  /** Sensitive userConfig values never land here (SecretStore); masked as `••••••••`. */
  options: Record<string, PluginOptionValue>;
  enabledWorkspaceIds: string[];
  registryId?: string;
  catalogPluginName?: string;
  installedAt: string;
  updatedAt: string;
};

export type PluginComponentSummary = {
  kind: PluginKind;
  status: ComponentStatus;
  inertReason?: string;
  source: ComponentSource;
};

export type PluginSummary = PluginRecord & {
  version?: string;
  description?: string;
  components: PluginComponentSummary[];
  skillCount: number;
  hookCount: number;
  mcpServerCount: number;
  agentCount: number;
  commandCount: number;
  lspServerCount: number;
};

export type PluginMutationResponse = {
  plugin: PluginSummary;
  diagnostics: PluginDiagnostic[];
};

export type PluginListItem = PluginMutationResponse;

export type InstallPluginRequest = {
  source?: string;
  path?: string;
  ref?: string;
  registryId?: string;
  catalogPluginName?: string;
  pluginName?: string;
};

export type SetPluginGrantsRequest = {
  classes: GrantClass[];
};

export type ApprovePluginServerRequest = {
  serverId: string;
};

export type SetPluginOptionRequest = {
  key: string;
  value: PluginOptionValue;
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
  | { type: 'git-subdir'; url: string; path: string; ref?: string; sha?: string }
  | { type: 'npm'; package: string; version?: string; registry?: string }
  | { type: 'archive'; url: string; sha256?: string };

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
  format?: PluginSourceFormat | 'unknown';
  inertComponents?: PluginKind[];
};

export type EnableWorkspacePluginRequest = {
  enabled: boolean;
};

export type RemovePluginRequest = {
  deleteData?: boolean;
};
