import { type AnySQLiteColumn, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const runsTable = sqliteTable(
  'runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    interruptId: text('interrupt_id'),
    waitFireAt: integer('wait_fire_at'),
    parentRunId: text('parent_run_id'),
    attempt: integer('attempt').notNull().default(1),
    leaseInstanceId: text('lease_instance_id'),
    leaseExpiresAt: integer('lease_expires_at'),
    leaseEpoch: integer('lease_epoch').notNull().default(0),
    lastSeq: integer('last_seq').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    claimIdx: index('runs_claim_idx').on(table.status, table.createdAt),
    askTtlIdx: index('runs_ask_ttl_idx').on(table.status, table.updatedAt),
    waitFireIdx: index('runs_wait_fire_idx').on(table.status, table.waitFireAt),
  }),
);

export type RunRow = typeof runsTable.$inferSelect;
export type RunInsert = typeof runsTable.$inferInsert;
