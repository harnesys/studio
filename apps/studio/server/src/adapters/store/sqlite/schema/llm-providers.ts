import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const llmProvidersTable = sqliteTable(
  'llm_providers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    driver: text('driver').notNull(),
    apiUrl: text('api_url'),
    apiKey: text('api_key'),
    headers: text('headers').notNull().default('{}'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('llm_providers_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
  }),
);

export type LlmProviderRow = typeof llmProvidersTable.$inferSelect;
export type LlmProviderInsert = typeof llmProvidersTable.$inferInsert;
