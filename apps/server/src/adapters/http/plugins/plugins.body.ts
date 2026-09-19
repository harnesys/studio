import { z } from 'zod';

export { installPluginBody } from './plugin-registries.body.ts';
export const removePluginBody = z.object({
  deleteData: z.boolean().optional(),
});
export const updatePluginBody = z.object({
  ref: z.string().trim().min(1).optional(),
});
export const approveServerBody = z.object({
  serverId: z.string().trim().min(1),
});
