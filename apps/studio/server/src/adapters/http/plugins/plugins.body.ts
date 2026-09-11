import { z } from 'zod';

export { installPluginBody } from './plugin-registries.body.ts';

export const trustPluginBody = z.object({
  trusted: z.boolean(),
});

export const enableWorkspacePluginBody = z.object({
  enabled: z.boolean(),
});

export const removePluginBody = z.object({
  deleteData: z.boolean().optional(),
});

export const updatePluginBody = z.object({
  ref: z.string().trim().min(1).optional(),
});
