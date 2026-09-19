import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const threadPlansTable = sqliteTable(
  'thread_plans',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .unique()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['draft', 'approved', 'in_progress', 'completed', 'cancelled'],
    })
      .notNull()
      .default('draft'),
    overview: text('overview').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'thread_plans_status_check',
      sql`${table.status} IN ('draft', 'approved', 'in_progress', 'completed', 'cancelled')`,
    ),
  }),
);

export const threadPlanItemsTable = sqliteTable(
  'thread_plan_items',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references((): AnySQLiteColumn => threadPlansTable.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status', {
      enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    subagentRole: text('subagent_role', {
      enum: ['explore', 'coder', 'verifier', 'general'],
    }),
    resultNote: text('result_note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'thread_plan_items_status_check',
      sql`${table.status} IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')`,
    ),
    orderCheck: check('thread_plan_items_order_check', sql`${table.order} >= 0`),
    planIdx: index('thread_plan_items_plan_idx').on(table.planId),
    orderUnique: index('thread_plan_items_plan_order_idx').on(table.planId, table.order),
  }),
);

export type ThreadPlanRow = typeof threadPlansTable.$inferSelect;
export type ThreadPlanInsert = typeof threadPlansTable.$inferInsert;
export type ThreadPlanItemRow = typeof threadPlanItemsTable.$inferSelect;
export type ThreadPlanItemInsert = typeof threadPlanItemsTable.$inferInsert;
