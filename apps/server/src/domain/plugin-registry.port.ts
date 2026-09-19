import type { CatalogEntry, RegistryKind } from 'harnesys/plugins-catalog';
export type PluginRegistryRecord = {
  id: string;
  name: string;
  kind: RegistryKind;
  source: string;
  path: string;
  revision?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};
export type PluginRegistryRepository = {
  list(): PluginRegistryRecord[];
  findById(id: string): PluginRegistryRecord | undefined;
  findByName(name: string): PluginRegistryRecord | undefined;
  upsert(rec: PluginRegistryRecord): PluginRegistryRecord;
  delete(id: string): void;
  replaceCatalog(registryId: string, entries: CatalogEntry[]): void;
  listCatalog(filter?: { registryId?: string; q?: string }): CatalogEntry[];
  findCatalogEntry(registryId: string, pluginName: string): CatalogEntry | undefined;
};
