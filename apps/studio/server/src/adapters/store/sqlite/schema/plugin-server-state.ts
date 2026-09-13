import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { pluginsTable } from './plugins.ts';

/** User-stopped plugin MCP servers per workspace. Presence = disabled by the user. */
export const pluginServerStateTable = sqliteTable(
  'plugin_server_state',
  {
    pluginName: text('plugin_name')
      .notNull()
      .references(() => pluginsTable.name, { onDelete: 'cascade' }),
    serverId: text('server_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    disabledAt: text('disabled_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pluginName, table.serverId, table.workspaceId] }),
  }),
);

export type PluginServerStateRow = typeof pluginServerStateTable.$inferSelect;
