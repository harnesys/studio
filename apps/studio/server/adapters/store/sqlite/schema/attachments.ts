import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const attachmentsTable = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threadsTable.id, { onDelete: 'cascade' }),
    entryId: text('entry_id'),
    name: text('name').notNull(),
    mediaType: text('media_type').notNull(),
    path: text('path').notNull(),
    bytes: integer('bytes').notNull(),
    kind: text('kind', { enum: ['image', 'audio', 'video', 'file'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    kindCheck: check(
      'attachments_kind_check',
      sql`${table.kind} IN ('image', 'audio', 'video', 'file')`,
    ),
    threadIdx: index('attachments_thread_idx').on(table.threadId),
    threadPendingIdx: index('attachments_thread_pending_idx')
      .on(table.threadId)
      .where(sql`${table.entryId} IS NULL`),
  }),
);

export type AttachmentRow = typeof attachmentsTable.$inferSelect;
export type AttachmentInsert = typeof attachmentsTable.$inferInsert;
