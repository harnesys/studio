import { jsonSchema, tool } from 'ai';
import type { ToolDefinition } from '../ports/tools.ts';

export { STREAM_CHUNK_SIZE } from '../constants.ts';

export type CallModelResult = {
  finishReason: string;
  text?: string;
  reasoning?: string;
  toolCalls?: { name: string; args: unknown; id: string }[];
  structured?: unknown;
  sources?: unknown[];
  files?: unknown[];
  usage?: unknown;
};

export type StreamChunk =
  | { type: 'delta'; text: string; id: string }
  | { type: 'reasoning-delta'; text: string; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | { type: 'tool-call'; name: string; args: unknown; id: string }
  | { type: 'source'; source: unknown }
  | { type: 'file'; file: unknown }
  | { type: 'chunk'; text: string; chunkId: string }
  | {
      type: 'completed';
      finishReason: string;
      text?: string;
      reasoning?: string;
      toolCalls?: { name: string; args: unknown; id: string }[];
      structured?: unknown;
      sources?: unknown[];
      files?: unknown[];
      usage?: unknown;
    };

export function toAiTools(
  names: string[],
  registry: Map<string, ToolDefinition> | undefined,
): Record<string, unknown> | undefined {
  if (names.length === 0) {
    return undefined;
  }
  if (!registry) {
    return undefined;
  }
  // Stable key order for provider prefix cache across steps.
  const ordered = [...names].sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const n of ordered) {
    const def = registry.get(n);
    if (!def) {
      continue;
    }
    out[n] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.input as never),
    });
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const FUNCTION_PREFIX = 'function:';

/** Some providers decorate tool names as `function:<name>`; the registry is the source of truth. */
export function canonicalToolName(name: string, registry?: Map<string, ToolDefinition>): string {
  if (!registry || !name.startsWith(FUNCTION_PREFIX) || registry.has(name)) {
    return name;
  }
  const stripped = name.slice(FUNCTION_PREFIX.length);
  return registry.has(stripped) ? stripped : name;
}

/** AI SDK / gateway may put a plain `{ code, message }` on the stream error part. */
export function toStreamError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (error && typeof error === 'object') {
    const rec = error as { message?: unknown; code?: unknown; metadata?: unknown };
    if (typeof rec.message === 'string' && rec.message) {
      return Object.assign(new Error(rec.message), {
        ...(rec.code !== undefined ? { code: rec.code } : {}),
        ...(rec.metadata !== undefined ? { metadata: rec.metadata } : {}),
      });
    }
  }
  if (error === undefined || error === null) {
    return new Error('stream error');
  }
  return new Error(String(error));
}
