import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { threadsTable } from './threads.ts';
import { workspacesTable } from './workspaces.ts';
export const webhooksTable = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status', { enum: ['active', 'paused', 'failed'] })
      .notNull()
      .default('active'),
    targetAgentId: text('target_agent_id')
      .notNull()
      .references(() => agentsTable.id),
    detail: text('detail').notNull().default(''),
    endpoint: text('endpoint').notNull(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threadsTable.id),
    lastFiredAt: text('last_fired_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'webhooks_status_check',
      sql`${table.status} IN ('active', 'paused', 'failed')`,
    ),
    workspaceIdx: index('webhooks_workspace_idx').on(table.workspaceId),
    threadIdx: index('webhooks_thread_idx').on(table.threadId),
  }),
);
export type WebhookRow = typeof webhooksTable.$inferSelect;
export type WebhookInsert = typeof webhooksTable.$inferInsert;
