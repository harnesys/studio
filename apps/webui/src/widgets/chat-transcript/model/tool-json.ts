export type JsonObject = Record<string, unknown>;

export function parseJson(raw: string | undefined): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
}

export function str(value: JsonObject | undefined, key: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

export function has(value: JsonObject, key: string): boolean {
  return value[key] !== undefined;
}
