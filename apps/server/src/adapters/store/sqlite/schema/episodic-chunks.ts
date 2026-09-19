import {
  type AnySQLiteColumn,
  blob,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';
import { workspacesTable } from './workspaces.ts';
export const episodicChunksTable = sqliteTable(
  'episodic_chunks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').notNull(),
    seq: integer('seq').notNull(),
    text: text('text').notNull(),
    compactionEntryId: text('compaction_entry_id'),
    embedding: blob('embedding', { mode: 'buffer' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    workspaceThreadIdx: index('episodic_chunks_workspace_thread_idx').on(
      table.workspaceId,
      table.threadId,
    ),
    threadSeqIdx: index('episodic_chunks_thread_seq_idx').on(table.threadId, table.seq),
  }),
);
export type EpisodicChunkRow = typeof episodicChunksTable.$inferSelect;
export type EpisodicChunkInsert = typeof episodicChunksTable.$inferInsert;
