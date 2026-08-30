import { z } from 'zod';

const optionalText = z.string().trim().nullish();

export const createThreadBody = z.object({
  title: optionalText,
  agentId: z.string().trim().nullish(),
  workspaceId: optionalText,
  kind: z.enum(['chat', 'schedule']).optional(),
});

export const updateThreadBody = createThreadBody;

export const sendThreadRunBody = z
  .object({
    clientId: z.string().uuid().optional(),
    text: z.string().trim().optional().default(''),
    effort: z.string().trim().min(1).optional(),
    mode: z.enum(['ask', 'auto', 'dont_ask', 'bypass', 'plan']).optional(),
    attachmentIds: z.array(z.string().uuid()).optional(),
  })
  .refine((value) => (value.text?.length ?? 0) > 0 || (value.attachmentIds?.length ?? 0) > 0, {
    message: 'text or attachments required',
  });

export const confirmRunBody = z.object({
  /** Provider `toolCallId` on tool_call steps — not a library UUID. */
  stepId: z.string().trim().min(1),
  decision: z.union([
    z.object({
      allow: z.literal(true),
      modifiedInput: z.unknown().optional(),
    }),
    z.object({
      deny: z.literal(true),
      reason: z.string().optional(),
    }),
  ]),
});

export const answerRunBody = z
  .object({
    stepId: z.string().uuid(),
    optionIds: z.array(z.string().min(1)).optional(),
    text: z.string().trim().optional(),
  })
  .refine((value) => (value.optionIds?.length ?? 0) > 0 || (value.text?.length ?? 0) > 0, {
    message: 'optionIds or text required',
  });
