import { SCHEDULE_HISTORIES, SCHEDULE_STATUSES } from '@harnesys/studio-shared';
import { z } from 'zod';
export const createScheduleBody = z.object({
  name: z.string().trim().min(1),
  targetAgentId: z.string().uuid(),
  detail: z.string().trim().optional(),
  cron: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).max(48).optional(),
  history: z.enum(SCHEDULE_HISTORIES).optional(),
  historyLast: z.number().int().min(1).max(99).optional(),
  threadId: z.string().uuid().optional(),
});
export const updateScheduleBody = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
  targetAgentId: z.string().uuid().optional(),
  detail: z.string().trim().optional(),
  cron: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).max(48).optional(),
  history: z.enum(SCHEDULE_HISTORIES).optional(),
  historyLast: z.number().int().min(1).max(99).optional(),
  threadId: z.string().uuid().optional(),
});
