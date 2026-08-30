import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const journalEntriesTable = sqliteTable(
  'journal_entries',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role').notNull(),
    createdAt: text('created_at').notNull(),
    /** JSON body of the entry (agent fields without steps; human/system payloads). */
    body: text('body').notNull().default('{}'),
  },
  (table) => ({
    threadSeqUnique: uniqueIndex('journal_entries_thread_seq_unique').on(table.threadId, table.seq),
    threadIdx: index('journal_entries_thread_idx').on(table.threadId),
  }),
);

export type JournalEntryRow = typeof journalEntriesTable.$inferSelect;
export type JournalEntryInsert = typeof journalEntriesTable.$inferInsert;
