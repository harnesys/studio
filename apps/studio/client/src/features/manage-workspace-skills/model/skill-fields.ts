import type { CreateWorkspaceSkillRequest } from '@harnesys/studio-shared';
import { z } from 'zod';

export const skillFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use kebab-case (e.g. writing-plans)'),
  description: z.string().trim().min(1, 'Description required'),
  whenToUse: z.string(),
  instructions: z.string().trim().min(1, 'Instructions required'),
});

export type SkillFieldsInput = z.input<typeof skillFieldsSchema>;
export type SkillFieldsOutput = z.output<typeof skillFieldsSchema>;

export function emptySkillFields(): SkillFieldsInput {
  return {
    name: '',
    description: '',
    whenToUse: '',
    instructions: '',
  };
}

export function toCreateSkillRequest(values: SkillFieldsOutput): CreateWorkspaceSkillRequest {
  const whenToUse = values.whenToUse.trim();
  return {
    name: values.name,
    description: values.description,
    instructions: values.instructions,
    ...(whenToUse ? { whenToUse } : {}),
  };
}
