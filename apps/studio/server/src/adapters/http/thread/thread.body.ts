import { z } from 'zod';

const optionalText = z.string().trim().nullish();

export const createThreadBody = z.object({
  title: optionalText,
  agentId: z.string().trim().nullish(),
  originAgentId: z.string().trim().nullish(),
  workspaceId: optionalText,
  kind: z.enum(['chat', 'schedule']).optional(),
  parentThreadId: z.string().trim().nullish(),
  forkAt: z.string().trim().nullish(),
});

export const updateThreadBody = z.object({
  title: optionalText,
  agentId: z.string().trim().nullish(),
  workspaceId: optionalText,
  kind: z.enum(['chat', 'schedule']).optional(),
  pinned: z.boolean().optional(),
});

export const sendThreadRunBody = z
  .object({
    clientId: z.string().uuid().optional(),
    clientEventId: z.string().uuid().optional(),
    text: z.string().trim().optional().default(''),
    effort: z.string().trim().min(1).optional(),
    mode: z.string().trim().min(1).max(48).optional(),
    attachmentIds: z.array(z.string().uuid()).optional(),
    skills: z
      .array(z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/))
      .max(10)
      .optional(),
  })
  .refine((value) => (value.text?.length ?? 0) > 0 || (value.attachmentIds?.length ?? 0) > 0, {
    message: 'text or attachments required',
  })
  .refine((value) => (value.skills?.length ? (value.text?.length ?? 0) > 0 : true), {
    message: 'skills require text',
  });

export const respondRunBody = z.object({
  askId: z.string().trim().min(1),
  payload: z.unknown().optional(),
});

export const rejectRunBody = z.object({
  askId: z.string().trim().min(1),
  note: z.string().trim().optional(),
});
