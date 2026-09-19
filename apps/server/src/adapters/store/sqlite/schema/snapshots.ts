import { type AnySQLiteColumn, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';
export const snapshotsTable = sqliteTable('snapshots', {
  sessionId: text('session_id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
  snapshot: text('snapshot').notNull(),
  sequence: integer('sequence').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export type SnapshotRow = typeof snapshotsTable.$inferSelect;
export type SnapshotInsert = typeof snapshotsTable.$inferInsert;
