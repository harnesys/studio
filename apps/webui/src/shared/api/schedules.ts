import type {
  CreateScheduleResponse,
  ScheduleHistory,
  ScheduleRecord,
  ScheduleStatus,
} from '@harnesys/studio-shared';
import { apiJson } from './client';
export type CreateScheduleInput = {
  name: string;
  targetAgentId: string;
  detail?: string;
  cron?: string;
  modeId?: string;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
};
export type UpdateScheduleInput = {
  name?: string;
  status?: ScheduleStatus;
  targetAgentId?: string;
  detail?: string;
  cron?: string;
  modeId?: string;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
};
export function listSchedules(workspaceId: string) {
  return apiJson<ScheduleRecord[]>(`/api/workspaces/${workspaceId}/schedules`);
}
export function createScheduleRecord(workspaceId: string, body: CreateScheduleInput) {
  return apiJson<CreateScheduleResponse>(`/api/workspaces/${workspaceId}/schedules`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function updateScheduleRecord(
  workspaceId: string,
  scheduleId: string,
  body: UpdateScheduleInput,
) {
  return apiJson<ScheduleRecord>(`/api/workspaces/${workspaceId}/schedules/${scheduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function deleteScheduleRecord(workspaceId: string, scheduleId: string) {
  return apiJson<void>(`/api/workspaces/${workspaceId}/schedules/${scheduleId}`, {
    method: 'DELETE',
  });
}
