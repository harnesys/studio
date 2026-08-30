import type { MemoryRecord, SemanticScope } from '@studio/shared';
import { z } from 'zod';

const SCOPES = ['session', 'long'] as const satisfies readonly SemanticScope[];

export const semanticFieldsSchema = z
  .object({
    scope: z.enum(SCOPES),
    key: z.string(),
    text: z.string().trim().min(1, 'Text required'),
  })
  .superRefine((value, ctx) => {
    const key = value.key.trim();
    if (key.length > 0 && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'Letters, digits, ., _, :, -',
      });
    }
  });

export type SemanticFieldsInput = z.input<typeof semanticFieldsSchema>;
export type SemanticFieldsOutput = z.output<typeof semanticFieldsSchema>;

export type SemanticDraft = {
  scope: SemanticScope;
  text: string;
  key?: string;
  /** Existing id when editing (delete + recreate). */
  id?: string;
  threadId?: string;
};

export function emptySemanticFields(scope: SemanticScope = 'long'): SemanticFieldsInput {
  return { scope, key: '', text: '' };
}

export function semanticFieldsFrom(row: MemoryRecord): SemanticFieldsInput {
  return {
    scope: row.scope,
    key: row.key ?? '',
    text: row.text,
  };
}

export function toSemanticDraft(
  values: SemanticFieldsOutput,
  options: { id?: string; threadId?: string } = {},
): SemanticDraft {
  const key = values.key.trim();
  return {
    scope: values.scope,
    text: values.text,
    ...(key ? { key } : {}),
    ...(options.id ? { id: options.id } : {}),
    ...(options.threadId ? { threadId: options.threadId } : {}),
  };
}

export const SCOPE_ITEMS: { value: SemanticScope; label: string }[] = [
  { value: 'long', label: 'long' },
  { value: 'session', label: 'session' },
];
