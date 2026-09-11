import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pluginRegistriesTable = sqliteTable(
  'plugin_registries',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    path: text('path').notNull(),
    revision: text('revision'),
    lastSyncAt: text('last_sync_at'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex('plugin_registries_name_unique').on(table.name),
  }),
);

export const pluginCatalogEntriesTable = sqliteTable(
  'plugin_catalog_entries',
  {
    id: text('id').primaryKey(),
    registryId: text('registry_id').notNull(),
    pluginName: text('plugin_name').notNull(),
    payload: text('payload').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    registryPluginUnique: uniqueIndex('plugin_catalog_entries_registry_plugin_unique').on(
      table.registryId,
      table.pluginName,
    ),
  }),
);

export type PluginRegistryRow = typeof pluginRegistriesTable.$inferSelect;
export type PluginRegistryInsert = typeof pluginRegistriesTable.$inferInsert;
export type PluginCatalogEntryRow = typeof pluginCatalogEntriesTable.$inferSelect;
export type PluginCatalogEntryInsert = typeof pluginCatalogEntriesTable.$inferInsert;
