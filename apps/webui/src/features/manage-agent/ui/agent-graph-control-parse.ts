import type { InterruptReason, JsonSchema } from 'harnesys';

export const INTERRUPT_REASONS: InterruptReason[] = [
  'human_review',
  'policy',
  'uncertain_effect',
  'definition_migrated',
  'work',
  'wait',
];

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export function tryParseObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function tryParseStringArray(raw: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed as string[];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function tryParseJsonSchema(raw: string): JsonSchema | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonSchema;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function inputAsText(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  return safeJson(input);
}

export function parseInputField(raw: string): string | Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const obj = tryParseObject(trimmed);
    if (obj !== undefined) {
      return obj;
    }
  }
  return raw;
}

export function isInterruptReason(value: string): value is InterruptReason {
  return (INTERRUPT_REASONS as string[]).includes(value);
}
