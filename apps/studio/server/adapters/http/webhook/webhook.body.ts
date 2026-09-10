import { z } from 'zod';

import { SCHEDULE_STATUSES } from '../../../../shared/types.ts';

export const createWebhookBody = z.object({
  name: z.string().trim().min(1),
  targetAgentId: z.string().uuid(),
  detail: z.string().trim().optional(),
  threadId: z.string().uuid().optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
});

export const updateWebhookBody = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
  targetAgentId: z.string().uuid().optional(),
  detail: z.string().trim().optional(),
  threadId: z.string().uuid().optional(),
});

export const fireWebhookBody = z.object({ text: z.string().trim().optional() }).optional();
