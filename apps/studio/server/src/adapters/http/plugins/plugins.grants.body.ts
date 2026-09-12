import { z } from 'zod';

export const GRANT_CLASSES = ['content', 'process', 'network'] as const;

export const setGrantsBody = z.object({
  classes: z.array(z.enum(GRANT_CLASSES)),
});
