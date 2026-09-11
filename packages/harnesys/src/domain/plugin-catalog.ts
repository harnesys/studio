export type RegistryKind = 'claude-marketplace';

export type CatalogInstallSource =
  | { type: 'relative'; path: string }
  | { type: 'github'; repo: string; ref?: string; sha?: string }
  | { type: 'url'; url: string; ref?: string; sha?: string }
  | { type: 'git-subdir'; url: string; path: string; ref?: string; sha?: string };

export type CatalogEntry = {
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

export type ParsedMarketplace = {
  name: string;
  description?: string;
  entries: Omit<CatalogEntry, 'registryId'>[];
};
