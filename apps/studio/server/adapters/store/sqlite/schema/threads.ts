import { sql } from 'drizzle-orm';
import { type AnySQLiteColumn, check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { workspacesTable } from './workspaces.ts';

export const threadsTable = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references((): AnySQLiteColumn => workspacesTable.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['chat', 'schedule', 'webhook'] })
      .notNull()
      .default('chat'),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastReadAt: text('last_read_at').notNull(),
  },
  (table) => ({
    kindCheck: check('threads_kind_check', sql`${table.kind} IN ('chat', 'schedule', 'webhook')`),
    workspaceIdx: index('threads_workspace_idx').on(table.workspaceId),
  }),
);
export type ThreadRow = typeof threadsTable.$inferSelect;
export type ThreadInsert = typeof threadsTable.$inferInsert;
