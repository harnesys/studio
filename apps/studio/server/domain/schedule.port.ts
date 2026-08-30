import type { PermissionMode, ScheduleHistory } from '../../shared/types.ts';

export type ScheduleStatus = 'active' | 'paused' | 'failed';

export type Schedule = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  mode: PermissionMode;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleInsert = Schedule;

export type SchedulePatch = Partial<{
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  mode: PermissionMode;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  updatedAt: string;
}>;
export type ScheduleRepository = {
  listByWorkspace(workspaceId: string): Schedule[];
  listDue(nowIso: string): Schedule[];
  findById(id: string): Schedule | undefined;
  findByThreadId(threadId: string): Schedule | undefined;
  insert(rec: ScheduleInsert): Schedule;
  update(id: string, patch: SchedulePatch): Schedule;
  delete(id: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
