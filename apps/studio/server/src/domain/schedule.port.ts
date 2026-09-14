import type { ScheduleHistory } from '@harnesys/studio-shared';

export type ScheduleStatus = 'active' | 'paused' | 'failed';

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
  modeId: string;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  updatedAt: string;
}>;
export type ScheduleRepository = {
  listByWorkspace(workspaceId: string): Schedule[];
  listByTargetAgent(workspaceId: string, agentId: string): Schedule[];
  listDue(nowIso: string): Schedule[];
  findById(id: string): Schedule | undefined;
  findByThreadId(threadId: string): Schedule | undefined;
  insert(rec: ScheduleInsert): Schedule;
  update(id: string, patch: SchedulePatch): Schedule;
  delete(id: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
