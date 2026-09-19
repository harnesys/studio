import { z } from 'zod';
export const setPluginOptionBody = z.object({
  key: z.string().trim().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
