import { z } from 'zod';

export const addPluginRegistryBody = z.object({
  source: z.string().trim().min(1),
  kind: z.literal('claude-marketplace').optional(),
});

export const installPluginBody = z
  .object({
    source: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1).optional(),
    ref: z.string().trim().min(1).optional(),
    trust: z.boolean().optional(),
    registryId: z.string().trim().min(1).optional(),
    catalogPluginName: z.string().trim().min(1).optional(),
    pluginName: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const fromCatalog = Boolean(value.registryId && value.pluginName);
    const fromGit = Boolean(value.source);
    if (!fromCatalog && !fromGit) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide source, or registryId + pluginName',
      });
    }
  });
