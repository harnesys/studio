import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { llmModelsTable } from './llm-models.ts';
import { workspacesTable } from './workspaces.ts';

export const agentsTable = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    modelId: text('model_id').references(() => llmModelsTable.id),
    role: text('role').notNull().default('Operator'),
    instructions: text('instructions').notNull().default(''),
    effort: text('effort'),
    generation: text('generation'),
    toolOutput: text('tool_output'),
    compactionJson: text('compaction_json'),
    memoryJson: text('memory_json'),
    skills: text('skills').notNull().default('[]'),
    mcpServers: text('mcp_servers').notNull().default('[]'),
    tools: text('tools').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('agents_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
  }),
);

export type AgentRow = typeof agentsTable.$inferSelect;
export type AgentInsert = typeof agentsTable.$inferInsert;
