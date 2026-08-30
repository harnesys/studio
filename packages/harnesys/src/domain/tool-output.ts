import type { ToolOutputSettings } from './agent-definition.ts';

export const DEFAULT_TOOL_OUTPUT_MAX_CHARS = 30_000;
export const DEFAULT_TOOL_OUTPUT_HEAD_CHARS = 8_000;
export const DEFAULT_TOOL_OUTPUT_TAIL_CHARS = 8_000;

export type ResolvedToolOutputSettings = {
  maxChars: number;
  headChars: number;
  tailChars: number;
};

function positiveInt(value: number | undefined | null, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function resolveToolOutputSettings(
  settings?: ToolOutputSettings | null,
): ResolvedToolOutputSettings {
  const maxChars = positiveInt(settings?.maxChars, DEFAULT_TOOL_OUTPUT_MAX_CHARS);
  let headChars = positiveInt(settings?.headChars, DEFAULT_TOOL_OUTPUT_HEAD_CHARS);
  let tailChars = positiveInt(settings?.tailChars, DEFAULT_TOOL_OUTPUT_TAIL_CHARS);
  const kept = headChars + tailChars;
  if (kept > maxChars && kept > 0) {
    const scale = maxChars / kept;
    headChars = Math.max(1, Math.floor(headChars * scale));
    tailChars = Math.max(1, Math.floor(tailChars * scale));
  }
  return { maxChars, headChars, tailChars };
}
