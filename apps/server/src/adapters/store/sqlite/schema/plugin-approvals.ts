import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pluginApprovalsTable = sqliteTable(
  'plugin_approvals',
  {
    workspaceId: text('workspace_id').notNull(),
    pluginName: text('plugin_name').notNull(),
    serverId: text('server_id').notNull(),
    approvedAt: text('approved_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.pluginName, table.serverId] }),
  }),
);

export type PluginApprovalRow = typeof pluginApprovalsTable.$inferSelect;
