import type { PluginSourceFormat } from './plugin.ts';
import type { PluginKind } from './plugin-ir.ts';

export type RegistryKind = 'claude-marketplace';

export type CatalogInstallSource =
  | { type: 'relative'; path: string }
  | { type: 'github'; repo: string; ref?: string; sha?: string }
  | { type: 'url'; url: string; ref?: string; sha?: string }
  | { type: 'git-subdir'; url: string; path: string; ref?: string; sha?: string }
  | { type: 'npm'; package: string; version?: string; registry?: string }
  | { type: 'archive'; url: string; sha256?: string };

/** marketplace.json `renames`: former plugin name → current name, or `null` when removed. */
export type CatalogRenames = Record<string, string | null>;

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
  format?: PluginSourceFormat | 'unknown';
  inertComponents?: PluginKind[];
};

export type ParsedMarketplace = {
  name: string;
  description?: string;
  renames?: CatalogRenames;
  entries: Omit<CatalogEntry, 'registryId'>[];
};
