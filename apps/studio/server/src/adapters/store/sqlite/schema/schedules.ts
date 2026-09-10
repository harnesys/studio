import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { threadsTable } from './threads.ts';
import { workspacesTable } from './workspaces.ts';

export const schedulesTable = sqliteTable(
  'schedules',
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
    cron: text('cron').notNull(),
    mode: text('mode', { enum: ['ask', 'auto', 'dont_ask', 'bypass'] })
      .notNull()
      .default('auto'),
    history: text('history', { enum: ['none', 'last', 'all'] })
      .notNull()
      .default('none'),
    historyLast: integer('history_last').notNull().default(1),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id),
    nextRunAt: text('next_run_at'),
    lastFiredAt: text('last_fired_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'schedules_status_check',
      sql`${table.status} IN ('active', 'paused', 'failed')`,
    ),
    modeCheck: check(
      'schedules_mode_check',
      sql`${table.mode} IN ('ask', 'auto', 'dont_ask', 'bypass')`,
    ),
    historyCheck: check(
      'schedules_history_check',
      sql`${table.history} IN ('none', 'last', 'all')`,
    ),
    workspaceIdx: index('schedules_workspace_idx').on(table.workspaceId),
    threadIdx: uniqueIndex('schedules_thread_idx').on(table.threadId),
  }),
);
export type ScheduleRow = typeof schedulesTable.$inferSelect;
export type ScheduleInsert = typeof schedulesTable.$inferInsert;
