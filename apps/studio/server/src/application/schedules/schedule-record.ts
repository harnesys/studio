import type { ScheduleRecord } from '@harnesys/studio-shared';
import type { Schedule } from '../../domain/schedule.port.ts';

export function toScheduleRecord(schedule: Schedule): ScheduleRecord {
  return {
    id: schedule.id,
    workspaceId: schedule.workspaceId,
    name: schedule.name,
    status: schedule.status,
    targetAgentId: schedule.targetAgentId,
    detail: schedule.detail,
    cron: schedule.cron,
    modeId: schedule.modeId,
    history: schedule.history,
    historyLast: schedule.historyLast,
    threadId: schedule.threadId,
    nextRunAt: schedule.nextRunAt,
    lastFiredAt: schedule.lastFiredAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
