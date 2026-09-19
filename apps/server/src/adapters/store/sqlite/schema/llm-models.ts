import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { llmProvidersTable } from './llm-providers.ts';
export const llmModelsTable = sqliteTable(
  'llm_models',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => llmProvidersTable.id),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    providerNameUnique: uniqueIndex('llm_models_provider_id_name_unique').on(
      table.providerId,
      table.name,
    ),
  }),
);
export type LlmModelRow = typeof llmModelsTable.$inferSelect;
export type LlmModelInsert = typeof llmModelsTable.$inferInsert;
