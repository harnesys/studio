import type { ScheduleHistory } from '@harnesys/studio-shared';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import type {
  Schedule,
  ScheduleInsert,
  SchedulePatch,
  ScheduleRepository,
} from '../../../../domain/schedule.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type ScheduleRow, schedulesTable } from '../schema';

export class SqliteScheduleRepo implements ScheduleRepository {
  constructor(private readonly db: StudioDb) {}

  listByWorkspace(workspaceId: string): Schedule[] {
    return this.db
      .select()
      .from(schedulesTable)
      .where(eq(schedulesTable.workspaceId, workspaceId))
      .all()
      .map(toSchedule);
  }

  listDue(nowIso: string): Schedule[] {
    return this.db
      .select()
      .from(schedulesTable)
      .where(
        and(
          eq(schedulesTable.status, 'active'),
          isNotNull(schedulesTable.nextRunAt),
          lte(schedulesTable.nextRunAt, nowIso),
        ),
      )
      .all()
      .map(toSchedule);
  }

  findById(id: string): Schedule | undefined {
    const row = this.db.select().from(schedulesTable).where(eq(schedulesTable.id, id)).get();
    return row ? toSchedule(row) : undefined;
  }

  findByThreadId(threadId: string): Schedule | undefined {
    const row = this.db
      .select()
      .from(schedulesTable)
      .where(eq(schedulesTable.threadId, threadId))
      .get();
    return row ? toSchedule(row) : undefined;
  }

  insert(rec: ScheduleInsert): Schedule {
    try {
      const row = this.db.insert(schedulesTable).values(rec).returning().get();
      return toSchedule(row);
    } catch (err) {
      return mapSqliteError(err, {
        conflict: 'schedule exists',
        notFound: 'workspace or agent not found',
        invalid: 'invalid schedule status',
      });
    }
  }

  update(id: string, patch: SchedulePatch): Schedule {
    try {
      const row = this.db
        .update(schedulesTable)
        .set(patch)
        .where(eq(schedulesTable.id, id))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('schedule not found');
      }
      return toSchedule(row);
    } catch (err) {
      return mapSqliteError(err, { notFound: 'target agent not found' });
    }
  }

  delete(id: string): void {
    this.db.delete(schedulesTable).where(eq(schedulesTable.id, id)).run();
  }

  deleteByWorkspace(workspaceId: string): void {
    this.db.delete(schedulesTable).where(eq(schedulesTable.workspaceId, workspaceId)).run();
  }
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    cron: row.cron,
    modeId: row.modeId,
    history: (row.history || 'none') as ScheduleHistory,
    historyLast: row.historyLast > 0 ? row.historyLast : 1,
    threadId: row.threadId,
    nextRunAt: row.nextRunAt,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
