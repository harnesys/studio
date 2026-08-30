import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspacesTable = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex('workspaces_name_unique').on(table.name),
    pathUnique: uniqueIndex('workspaces_path_unique').on(table.path),
  }),
);

export type WorkspaceRow = typeof workspacesTable.$inferSelect;
export type WorkspaceInsert = typeof workspacesTable.$inferInsert;
