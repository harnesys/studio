import type {
  PlanItemRecord,
  PlanItemStatus,
  PlanStatus,
  SavePlanItemInput,
  SubagentRole,
  ThreadPlanRecord,
} from '@harnesys/studio-shared';
import { and, asc, eq } from 'drizzle-orm';
import type { PlanRepository } from '../../../../domain/plan.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import {
  type ThreadPlanItemRow,
  type ThreadPlanRow,
  threadPlanItemsTable,
  threadPlansTable,
} from '../schema/plans.ts';

function toPlanItemRecord(row: ThreadPlanItemRow): PlanItemRecord {
  return {
    id: row.id,
    planId: row.planId,
    order: row.order,
    title: row.title,
    description: row.description,
    status: row.status as PlanItemStatus,
    subagentRole: (row.subagentRole as SubagentRole) || null,
    resultNote: row.resultNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toThreadPlanRecord(
  planRow: ThreadPlanRow,
  itemRows: ThreadPlanItemRow[],
): ThreadPlanRecord {
  return {
    id: planRow.id,
    threadId: planRow.threadId,
    status: planRow.status as PlanStatus,
    overview: planRow.overview,
    items: itemRows.map(toPlanItemRecord),
    createdAt: planRow.createdAt,
    updatedAt: planRow.updatedAt,
  };
}

export class SqlitePlanRepo implements PlanRepository {
  constructor(private readonly db: StudioDb) {}

  getByThreadId(threadId: string): ThreadPlanRecord | null {
    const planRow = this.db
      .select()
      .from(threadPlansTable)
      .where(eq(threadPlansTable.threadId, threadId))
      .get();
    if (!planRow) {
      return null;
    }

    const itemRows = this.db
      .select()
      .from(threadPlanItemsTable)
      .where(eq(threadPlanItemsTable.planId, planRow.id))
      .orderBy(asc(threadPlanItemsTable.order))
      .all();

    return toThreadPlanRecord(planRow, itemRows);
  }

  getById(planId: string): ThreadPlanRecord | null {
    const planRow = this.db
      .select()
      .from(threadPlansTable)
      .where(eq(threadPlansTable.id, planId))
      .get();
    if (!planRow) {
      return null;
    }

    const itemRows = this.db
      .select()
      .from(threadPlanItemsTable)
      .where(eq(threadPlanItemsTable.planId, planRow.id))
      .orderBy(asc(threadPlanItemsTable.order))
      .all();

    return toThreadPlanRecord(planRow, itemRows);
  }

  savePlan(input: {
    id: string;
    threadId: string;
    overview: string;
    status: PlanStatus;
    items: SavePlanItemInput[];
  }): ThreadPlanRecord {
    const now = new Date().toISOString();
    const existing = this.getByThreadId(input.threadId);
    const planId = existing?.id ?? input.id;

    if (existing) {
      this.db
        .update(threadPlansTable)
        .set({
          overview: input.overview,
          status: input.status,
          updatedAt: now,
        })
        .where(eq(threadPlansTable.id, planId))
        .run();

      this.db.delete(threadPlanItemsTable).where(eq(threadPlanItemsTable.planId, planId)).run();
    } else {
      this.db
        .insert(threadPlansTable)
        .values({
          id: planId,
          threadId: input.threadId,
          overview: input.overview,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    if (input.items.length > 0) {
      const itemsToInsert = input.items.map((item, index) => ({
        id: item.id || crypto.randomUUID(),
        planId,
        order: index,
        title: item.title,
        description: item.description,
        status: 'pending' as const,
        subagentRole: item.subagentRole ?? null,
        resultNote: null,
        createdAt: now,
        updatedAt: now,
      }));

      this.db.insert(threadPlanItemsTable).values(itemsToInsert).run();
    }

    const saved = this.getById(planId);
    if (!saved) {
      throw new NotFoundError('plan not found after save');
    }
    return saved;
  }

  updateItemStatus(input: {
    planId: string;
    itemId: string;
    status: PlanItemStatus;
    resultNote?: string | null;
  }): PlanItemRecord | null {
    const now = new Date().toISOString();
    const updateData: {
      status: PlanItemStatus;
      updatedAt: string;
      resultNote?: string | null;
    } = {
      status: input.status,
      updatedAt: now,
    };
    if (input.resultNote !== undefined) {
      updateData.resultNote = input.resultNote;
    }

    this.db
      .update(threadPlanItemsTable)
      .set(updateData)
      .where(
        and(
          eq(threadPlanItemsTable.id, input.itemId),
          eq(threadPlanItemsTable.planId, input.planId),
        ),
      )
      .run();

    const updatedRow = this.db
      .select()
      .from(threadPlanItemsTable)
      .where(
        and(
          eq(threadPlanItemsTable.id, input.itemId),
          eq(threadPlanItemsTable.planId, input.planId),
        ),
      )
      .get();

    if (updatedRow) {
      this.db
        .update(threadPlansTable)
        .set({ updatedAt: now })
        .where(eq(threadPlansTable.id, input.planId))
        .run();
    }

    return updatedRow ? toPlanItemRecord(updatedRow) : null;
  }

  updatePlanStatus(planId: string, status: PlanStatus): ThreadPlanRecord | null {
    const now = new Date().toISOString();
    this.db
      .update(threadPlansTable)
      .set({ status, updatedAt: now })
      .where(eq(threadPlansTable.id, planId))
      .run();

    return this.getById(planId);
  }

  deleteByThreadId(threadId: string): void {
    this.db.delete(threadPlansTable).where(eq(threadPlansTable.threadId, threadId)).run();
  }
}
