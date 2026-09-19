import { blob, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';
export const knowledgeChunksTable = sqliteTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
    title: text('title'),
    text: text('text').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workspaceIdx: index('knowledge_chunks_workspace_idx').on(table.workspaceId),
    workspaceUriIdx: index('knowledge_chunks_workspace_uri_idx').on(table.workspaceId, table.uri),
  }),
);
export type KnowledgeChunkRow = typeof knowledgeChunksTable.$inferSelect;
export type KnowledgeChunkInsert = typeof knowledgeChunksTable.$inferInsert;
