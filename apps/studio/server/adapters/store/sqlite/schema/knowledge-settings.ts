import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';

export const knowledgeSettingsTable = sqliteTable(
  'knowledge_settings',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    entireWorkspace: integer('entire_workspace', { mode: 'boolean' }).notNull().default(false),
    backend: text('backend', { enum: ['fts', 'vector'] })
      .notNull()
      .default('fts'),
    embedProvider: text('embed_provider'),
    embedModel: text('embed_model'),
    watchEnabled: integer('watch_enabled', { mode: 'boolean' }).notNull().default(true),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    backendCheck: check(
      'knowledge_settings_backend_check',
      sql`${table.backend} IN ('fts', 'vector')`,
    ),
  }),
);

export type KnowledgeSettingsRow = typeof knowledgeSettingsTable.$inferSelect;
export type KnowledgeSettingsInsert = typeof knowledgeSettingsTable.$inferInsert;
