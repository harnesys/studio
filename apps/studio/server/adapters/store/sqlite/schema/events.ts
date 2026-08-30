import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const eventsTable = sqliteTable(
  'events',
  {
    eventId: text('event_id').primaryKey(),
    sessionId: text('session_id').notNull(),
    threadId: text('thread_id').notNull(),
    type: text('type').notNull(),
    sequence: integer('sequence').notNull(),
    timestamp: integer('timestamp').notNull(),
    metadata: text('metadata'),
  },
  (table) => ({
    sessionSequenceIdx: index('events_session_sequence_idx').on(table.sessionId, table.sequence),
  }),
);

export type EventRow = typeof eventsTable.$inferSelect;
export type EventInsert = typeof eventsTable.$inferInsert;
