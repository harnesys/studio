import { MODE_ID_RE, MODE_OPS } from '@harnesys/studio-shared';
import { z } from 'zod';

const gates = z.enum(['allow', 'ask', 'deny']);

export const modePresetBody = z.object({
  id: z.string().regex(MODE_ID_RE).max(48),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instructions: z.string().max(6000).optional(),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  packs: z.array(z.string().trim().min(1)).max(16).optional(),
  permissions: z.partialRecord(z.enum(MODE_OPS), gates).optional(),
  installedByDefault: z.boolean().optional(),
});

export const modePresetPatchBody = modePresetBody.partial().omit({ id: true });
