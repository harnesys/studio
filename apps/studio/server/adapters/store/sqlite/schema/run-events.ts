import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const runEventsTable = sqliteTable(
  'run_events',
  {
    runId: text('run_id').notNull(),
    seq: integer('seq').notNull(),
    threadId: text('thread_id').notNull(),
    type: text('type').notNull(),
    timestamp: integer('timestamp').notNull(),
    metadata: text('metadata'),
    clientEventId: text('client_event_id'),
  },
  (table) => ({
    pk: index('run_events_pk').on(table.runId, table.seq),
    clientIdx: index('run_events_client_idx').on(table.threadId, table.clientEventId),
  }),
);

export type RunEventRow = typeof runEventsTable.$inferSelect;
