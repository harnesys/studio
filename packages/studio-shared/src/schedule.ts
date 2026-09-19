import type { ScheduleHistory } from 'harnesys';
import { SCHEDULE_HISTORIES } from 'harnesys/domain';
import type { ThreadRecord } from './thread.ts';

export const SCHEDULE_STATUSES = ['active', 'paused', 'failed'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export type ScheduleRecord = {
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
  nextRunAt?: string | null;
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CreateScheduleResponse = {
  schedule: ScheduleRecord;
  thread: ThreadRecord;
};
export type WebhookStatus = ScheduleStatus;
export type WebhookRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CreateWebhookResponse = {
  webhook: WebhookRecord;
  thread: ThreadRecord;
};
export function isScheduleHistory(value: string): value is ScheduleHistory {
  return (SCHEDULE_HISTORIES as readonly string[]).includes(value);
}
