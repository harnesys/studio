import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';

export const knowledgeIndexStateTable = sqliteTable(
  'knowledge_index_state',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['idle', 'running', 'error'] })
      .notNull()
      .default('idle'),
    phase: text('phase'),
    processed: integer('processed').notNull().default(0),
    total: integer('total').notNull().default(0),
    lastError: text('last_error'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (table) => ({
    statusCheck: check(
      'knowledge_index_state_status_check',
      sql`${table.status} IN ('idle', 'running', 'error')`,
    ),
  }),
);

export type KnowledgeIndexStateRow = typeof knowledgeIndexStateTable.$inferSelect;
export type KnowledgeIndexStateInsert = typeof knowledgeIndexStateTable.$inferInsert;
