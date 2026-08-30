import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';

export const knowledgeFilesTable = sqliteTable(
  'knowledge_files',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
    status: text('status', { enum: ['pending', 'indexed', 'skipped', 'error'] }).notNull(),
    skipReason: text('skip_reason'),
    mtimeMs: integer('mtime_ms'),
    sizeBytes: integer('size_bytes'),
    contentHash: text('content_hash'),
    chunkCount: integer('chunk_count').notNull().default(0),
    lastError: text('last_error'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'knowledge_files_pk',
      columns: [table.workspaceId, table.uri],
    }),
    workspaceStatusIdx: index('knowledge_files_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    statusCheck: check(
      'knowledge_files_status_check',
      sql`${table.status} IN ('pending', 'indexed', 'skipped', 'error')`,
    ),
  }),
);

export type KnowledgeFileRow = typeof knowledgeFilesTable.$inferSelect;
export type KnowledgeFileInsert = typeof knowledgeFilesTable.$inferInsert;
