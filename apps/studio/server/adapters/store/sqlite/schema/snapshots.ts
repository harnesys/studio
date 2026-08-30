import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const snapshotsTable = sqliteTable('snapshots', {
  sessionId: text('session_id').primaryKey(),
  threadId: text('thread_id').notNull(),
  snapshot: text('snapshot').notNull(),
  sequence: integer('sequence').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type SnapshotRow = typeof snapshotsTable.$inferSelect;
export type SnapshotInsert = typeof snapshotsTable.$inferInsert;
