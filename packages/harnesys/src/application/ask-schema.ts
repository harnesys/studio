import type { JsonSchema } from '../domain/json-schema.ts';

export const ASK_SCHEMA_KEYS = ['options', 'multi', 'allowText'] as const;

export type AskUserSchemaInput = {
  options?: Array<{ id: string; label: string }>;
  multi?: boolean;
  allowText?: boolean;
};

export function askUserSchema(input: AskUserSchemaInput): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (input.options?.length) {
    properties.optionIds = {
      type: 'array',
      items: { type: 'string', enum: input.options.map((o) => o.id) },
      ...(input.multi ? {} : { maxItems: 1 }),
    };
    required.push('optionIds');
  }
  if (input.allowText !== false) {
    properties.text = { type: 'string' };
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) {
    schema.required = required;
  }
  if (input.options?.length) {
    schema.options = input.options; // служебные ключи: Ajv strict:false игнорирует; клиент читает для рендера
    schema.multi = input.multi === true;
  }
  return schema as JsonSchema;
}
