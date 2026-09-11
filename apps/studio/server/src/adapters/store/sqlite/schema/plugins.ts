import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pluginsTable = sqliteTable(
  'plugins',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    source: text('source').notNull(),
    revision: text('revision').notNull(),
    path: text('path').notNull(),
    dataPath: text('data_path').notNull(),
    trusted: integer('trusted', { mode: 'boolean' }).notNull().default(false),
    enabledWorkspaceIds: text('enabled_workspace_ids').notNull().default('[]'),
    registryId: text('registry_id'),
    catalogPluginName: text('catalog_plugin_name'),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex('plugins_name_unique').on(table.name),
  }),
);

export type PluginRow = typeof pluginsTable.$inferSelect;
export type PluginInsert = typeof pluginsTable.$inferInsert;
