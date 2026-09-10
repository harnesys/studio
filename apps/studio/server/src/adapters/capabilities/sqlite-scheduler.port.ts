import type { ScheduleRecord as StudioScheduleRecord } from '@harnesys/studio-shared';
import type {
  CapabilityScope,
  ScheduleCreatedRecord,
  ScheduleCreateInput,
  SchedulePeekRecord,
  ScheduleRecord,
  SchedulerPort,
  ScheduleUpdateInput,
} from 'harnesys';
import type { CreateScheduleInput } from '../../application/schedules/create-schedule.use-case.ts';
import type { DeleteScheduleInput } from '../../application/schedules/delete-schedule.use-case.ts';
import type { ListSchedulesInput } from '../../application/schedules/list-schedules.use-case.ts';
import type { PeekScheduleInput } from '../../application/schedules/peek-schedule.use-case.ts';
import type { UpdateScheduleInput } from '../../application/schedules/update-schedule.use-case.ts';

export type SqliteSchedulerPortDeps = {
  listSchedules: ListSchedulesInput;
  peekSchedule: PeekScheduleInput;
  createSchedule: CreateScheduleInput;
  updateSchedule: UpdateScheduleInput;
  deleteSchedule: DeleteScheduleInput;
};

function toScheduleRecord(row: StudioScheduleRecord): ScheduleRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    cron: row.cron,
    mode: row.mode,
    history: row.history,
    historyLast: row.historyLast,
    threadId: row.threadId,
    nextRunAt: row.nextRunAt ?? null,
    lastFiredAt: row.lastFiredAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteSchedulerPort implements SchedulerPort {
  constructor(private readonly deps: SqliteSchedulerPortDeps) {}

  async list(scope: CapabilityScope): Promise<ScheduleRecord[]> {
    const rows = await this.deps.listSchedules.execute({ workspaceId: scope.workspaceId });
    return rows.map(toScheduleRecord);
  }

  async peek(scope: CapabilityScope, id: string, last?: number): Promise<SchedulePeekRecord> {
    const result = await this.deps.peekSchedule.execute({
      workspaceId: scope.workspaceId,
      id,
      last,
    });
    return {
      id: result.id,
      name: result.name,
      threadId: result.threadId,
      lastFiredAt: result.lastFiredAt,
      fires: result.fires,
    };
  }

  async create(scope: CapabilityScope, input: ScheduleCreateInput): Promise<ScheduleCreatedRecord> {
    const created = await this.deps.createSchedule.execute({
      workspaceId: scope.workspaceId,
      name: input.name,
      targetAgentId: input.targetAgentId ?? scope.agentId,
      cron: input.cron,
      detail: input.detail,
      mode: input.mode,
      history: input.history,
      historyLast: input.historyLast,
      threadId: input.threadId,
    });
    return {
      schedule: toScheduleRecord(created.schedule),
      thread: {
        id: created.thread.id,
        title: created.thread.title,
        kind: created.thread.kind,
        agentId: created.thread.agentId,
      },
    };
  }

  async update(
    scope: CapabilityScope,
    id: string,
    patch: ScheduleUpdateInput,
  ): Promise<ScheduleRecord> {
    const record = await this.deps.updateSchedule.execute({
      workspaceId: scope.workspaceId,
      id,
      ...patch,
    });
    return toScheduleRecord(record);
  }

  async remove(scope: CapabilityScope, id: string): Promise<void> {
    await this.deps.deleteSchedule.execute({ workspaceId: scope.workspaceId, id });
  }
}
