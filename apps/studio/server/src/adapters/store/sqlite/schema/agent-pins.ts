import { sql } from 'drizzle-orm';
import { check, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspacesTable } from './workspaces.ts';

export const agentPinsTable = sqliteTable(
  'agent_pins',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspacesTable.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    key: text('key').notNull(),
    text: text('text').notNull(),
    source: text('source', { enum: ['agent', 'human'] }).notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'agent_pins_pk',
      columns: [table.workspaceId, table.agentName, table.key],
    }),
    sourceCheck: check('agent_pins_source_check', sql`${table.source} IN ('agent', 'human')`),
  }),
);

export type AgentPinRow = typeof agentPinsTable.$inferSelect;
export type AgentPinInsert = typeof agentPinsTable.$inferInsert;
