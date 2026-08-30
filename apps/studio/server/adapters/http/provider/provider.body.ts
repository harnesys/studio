import { z } from 'zod';
import { DRIVERS } from '../../../../shared/types.ts';

const driver = z.enum(DRIVERS);
const optionalText = z.string().trim().nullish();
const patchText = z.string().nullable();

export const createProviderBody = z.object({
  name: z.string().trim().min(1),
  driver,
  apiUrl: optionalText,
  apiKey: optionalText,
  enabled: z.boolean().optional(),
});

export const updateProviderBody = z.object({
  name: z.string().trim().min(1).optional(),
  driver: driver.optional(),
  enabled: z.boolean().optional(),
  apiUrl: patchText.optional(),
  apiKey: patchText.optional(),
});
