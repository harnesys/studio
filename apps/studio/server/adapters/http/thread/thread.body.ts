import { z } from 'zod';

const optionalText = z.string().trim().nullish();

export const createThreadBody = z.object({
  title: optionalText,
  agentId: z.string().trim().nullish(),
  workspaceId: optionalText,
  kind: z.enum(['chat', 'schedule']).optional(),
});

export const updateThreadBody = createThreadBody.extend({
  pinned: z.boolean().optional(),
});

export const sendThreadRunBody = z
  .object({
    clientId: z.string().uuid().optional(),
    clientEventId: z.string().uuid().optional(),
    text: z.string().trim().optional().default(''),
    effort: z.string().trim().min(1).optional(),
    mode: z.enum(['ask', 'auto', 'dont_ask', 'bypass', 'plan']).optional(),
    attachmentIds: z.array(z.string().uuid()).optional(),
  })
  .refine((value) => (value.text?.length ?? 0) > 0 || (value.attachmentIds?.length ?? 0) > 0, {
    message: 'text or attachments required',
  });

export const respondRunBody = z.object({
  askId: z.string().trim().min(1),
  payload: z.unknown().optional(),
});

export const rejectRunBody = z.object({
  askId: z.string().trim().min(1),
  note: z.string().trim().optional(),
});
