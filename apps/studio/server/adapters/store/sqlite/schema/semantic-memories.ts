import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';

export const semanticMemoriesTable = sqliteTable(
  'semantic_memories',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    scope: text('scope', { enum: ['session', 'long'] }).notNull(),
    key: text('key'),
    text: text('text').notNull(),
    source: text('source', { enum: ['agent', 'human'] }).notNull(),
    threadId: text('thread_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    longKeyedUnique: uniqueIndex('semantic_memories_long_keyed_unique')
      .on(table.workspaceId, table.agentName, table.scope, table.key)
      .where(sql`${table.key} IS NOT NULL AND ${table.scope} = 'long'`),
    sessionKeyedUnique: uniqueIndex('semantic_memories_session_keyed_unique')
      .on(table.workspaceId, table.agentName, table.scope, table.key, table.threadId)
      .where(sql`${table.key} IS NOT NULL AND ${table.scope} = 'session'`),
    workspaceAgentIdx: index('semantic_memories_workspace_agent_idx').on(
      table.workspaceId,
      table.agentName,
    ),
    threadIdx: index('semantic_memories_thread_idx').on(table.workspaceId, table.threadId),
    scopeCheck: check('semantic_memories_scope_check', sql`${table.scope} IN ('session', 'long')`),
    sourceCheck: check(
      'semantic_memories_source_check',
      sql`${table.source} IN ('agent', 'human')`,
    ),
  }),
);

export type SemanticMemoryRow = typeof semanticMemoriesTable.$inferSelect;
export type SemanticMemoryInsert = typeof semanticMemoriesTable.$inferInsert;
