import {
  DEFAULT_MODE_ID,
  type ScheduleHistory,
  type ScheduleRecord,
  type ScheduleStatus,
} from '@harnesys/studio-shared';

export { SCHEDULE_HISTORIES, SCHEDULE_STATUSES } from '@harnesys/studio-shared';
export type { ScheduleHistory, ScheduleStatus };

export function scheduleStatusTone(
  status: ScheduleStatus,
): 'idle' | 'live' | 'wait' | 'danger' | 'off' {
  switch (status) {
    case 'active':
      return 'live';
    case 'paused':
      return 'wait';
    case 'failed':
      return 'danger';
  }
}

export function scheduleStatusLabel(status: ScheduleStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
  }
}

export function scheduleInk(status: ScheduleStatus): string {
  switch (status) {
    case 'active':
      return 'text-live';
    case 'paused':
      return 'text-muted-foreground';
    case 'failed':
      return 'text-destructive';
  }
}

export type Schedule = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  modeId: string;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt?: string;
  lastFiredAt?: string;
  updatedAt: string;
};

export function toClientSchedule(record: ScheduleRecord): Schedule {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    status: record.status,
    targetAgentId: record.targetAgentId,
    detail: record.detail,
    cron: record.cron,
    modeId: record.modeId ?? DEFAULT_MODE_ID,
    history: record.history ?? 'none',
    historyLast: record.historyLast > 0 ? record.historyLast : 1,
    threadId: record.threadId,
    nextRunAt: record.nextRunAt ?? undefined,
    lastFiredAt: record.lastFiredAt ?? undefined,
    updatedAt: record.updatedAt ?? record.createdAt ?? '',
  };
}
