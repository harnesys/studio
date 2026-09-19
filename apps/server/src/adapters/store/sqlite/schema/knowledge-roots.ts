import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';
export const knowledgeRootsTable = sqliteTable(
  'knowledge_roots',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => ({
    pk: primaryKey({
      name: 'knowledge_roots_pk',
      columns: [table.workspaceId, table.path],
    }),
  }),
);
export type KnowledgeRootRow = typeof knowledgeRootsTable.$inferSelect;
export type KnowledgeRootInsert = typeof knowledgeRootsTable.$inferInsert;
