import { DEFAULT_MODE_ID, MODE_ID_RE, MODE_OPS } from '@harnesys/studio-shared';
import { z } from 'zod';

const gates = z.enum(['allow', 'ask', 'deny']);
const packAssignmentBody = z
  .union([
    z.literal(true),
    z.literal(false),
    z.object({ spec: z.record(z.string(), z.unknown()).optional() }),
    z.null(),
  ])
  .transform((value) => {
    if (value === true) {
      return {};
    }
    if (value === false || value === null) {
      return null;
    }
    return value;
  });
const modePresetShape = z.object({
  id: z.string().regex(MODE_ID_RE).max(48),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instructions: z.string().max(6000).optional(),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  packs: z.record(z.string(), packAssignmentBody).optional(),
  permissions: z.partialRecord(z.enum(MODE_OPS), gates).optional(),
  installedByDefault: z.boolean().optional(),
});
export const modePresetBody = modePresetShape.refine((body) => body.id !== DEFAULT_MODE_ID, {
  message: 'id "default" is reserved',
  path: ['id'],
});
export const modePresetPatchBody = modePresetShape.partial().omit({ id: true });
