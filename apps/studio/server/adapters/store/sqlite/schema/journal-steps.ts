import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { journalEntriesTable } from './journal-entries.ts';

export const journalStepsTable = sqliteTable(
  'journal_steps',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references((): AnySQLiteColumn => journalEntriesTable.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    /** JSON: payload, meta, error. */
    body: text('body').notNull().default('{}'),
  },
  (table) => ({
    entrySeqUnique: uniqueIndex('journal_steps_entry_seq_unique').on(table.entryId, table.seq),
    entryIdx: index('journal_steps_entry_idx').on(table.entryId),
  }),
);

export type JournalStepRow = typeof journalStepsTable.$inferSelect;
export type JournalStepInsert = typeof journalStepsTable.$inferInsert;
