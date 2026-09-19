import type { UpsertKnowledgeRootRequest } from '@harnesys/studio-shared';
import { z } from 'zod';

export const knowledgeRootFieldsSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1, 'Path required')
    .refine((value) => !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value), {
      message: 'Use a path relative to the workspace',
    }),
  enabled: z.boolean(),
});

export type KnowledgeRootFieldsInput = z.input<typeof knowledgeRootFieldsSchema>;
export type KnowledgeRootFieldsOutput = z.output<typeof knowledgeRootFieldsSchema>;

export type KnowledgeRootDraft = UpsertKnowledgeRootRequest;

export function emptyKnowledgeRootFields(): KnowledgeRootFieldsInput {
  return {
    path: '',
    enabled: true,
  };
}

export function toKnowledgeRootDraft(values: KnowledgeRootFieldsOutput): KnowledgeRootDraft {
  return {
    path: values.path,
    enabled: values.enabled,
  };
}
