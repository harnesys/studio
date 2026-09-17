import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { pluginRegistriesTable } from './plugin-registries.ts';

export const pluginsTable = sqliteTable(
  'plugins',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    source: text('source').notNull(),
    revision: text('revision').notNull(),
    path: text('path').notNull(),
    dataPath: text('data_path').notNull(),
    format: text('format'),
    irSummary: text('ir_summary'),
    grants: text('grants').notNull().default('{}'),
    options: text('options').notNull().default('{}'),
    registryId: text('registry_id').references(() => pluginRegistriesTable.id, {
      onDelete: 'set null',
    }),
    catalogPluginName: text('catalog_plugin_name'),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('plugins_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
  }),
);

export type PluginRow = typeof pluginsTable.$inferSelect;
export type PluginInsert = typeof pluginsTable.$inferInsert;
