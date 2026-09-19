import { DRIVERS } from '@harnesys/studio-shared';
import { z } from 'zod';

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
const exportModelBody = z.object({
  name: z.string().trim().min(1),
  kind: z.string().trim().min(1).default('chat'),
  metadata: z.unknown().optional(),
});
export const importProvidersBody = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  providers: z.array(
    z.object({
      name: z.string().trim().min(1),
      driver,
      apiUrl: z.string().trim().optional(),
      apiKey: z.string().trim().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().default(true),
      models: z.array(exportModelBody).default([]),
    }),
  ),
});
