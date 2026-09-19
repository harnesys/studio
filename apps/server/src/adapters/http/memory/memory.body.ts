import { z } from 'zod';
export const upsertPinBody = z.object({
  text: z.string(),
});
export const upsertSemanticBody = z
  .object({
    scope: z.enum(['session', 'long']),
    text: z.string().trim().min(1),
    key: z.string().trim().min(1).optional(),
    threadId: z.string().uuid().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.scope === 'session' && !body.threadId) {
      ctx.addIssue({
        code: 'custom',
        path: ['threadId'],
        message: 'Required for session scope',
      });
    }
  });
export const updateSemanticBody = z.object({
  text: z.string().trim().min(1),
});
export const listSemanticQuery = z.object({
  scope: z.enum(['session', 'long']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
export const searchMemoryQuery = z.object({
  query: z.string().trim().min(1),
  threadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export const upsertKnowledgeRootBody = z.object({
  path: z.string().trim().min(1),
  enabled: z.boolean().optional(),
});
export const putKnowledgeSettingsBody = z
  .object({
    entireWorkspace: z.boolean().optional(),
    backend: z.enum(['fts', 'vector']).optional(),
    embedProvider: z.string().trim().min(1).nullable().optional(),
    embedModel: z.string().trim().min(1).nullable().optional(),
    watchEnabled: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const provider = body.embedProvider;
    const model = body.embedModel;
    if (provider === undefined && model === undefined) {
      return;
    }
    const providerSet = provider != null;
    const modelSet = model != null;
    if (providerSet !== modelSet) {
      ctx.addIssue({
        code: 'custom',
        path: ['embedModel'],
        message: 'embedProvider and embedModel must both be set or both be null',
      });
    }
  });
export const listKnowledgeFilesQuery = z.object({
  status: z.enum(['pending', 'indexed', 'skipped', 'error']).optional(),
});
