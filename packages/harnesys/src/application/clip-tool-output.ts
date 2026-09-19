import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveWorkdirPath } from '../adapters/actions/path-resolve.ts';
import type { ToolOutputSettings } from '../domain/agent-definition.ts';
import {
  type ResolvedToolOutputSettings,
  resolveToolOutputSettings,
} from '../domain/tool-output.ts';
import type { PathsConfig } from '../ports/paths.ts';
export function serializeToolOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function toolOutputRelPath(sessionId: string, fileName: string): string {
  return `.harnesys/threads/${sessionId}/tool-outputs/${fileName}`;
}
function toolOutputFileName(toolName: string, toolCallId: string): string {
  return `${safeSegment(toolName, 'tool')}-${safeSegment(toolCallId, 'call')}.txt`;
}
export async function presentToolOutput(input: {
  value: unknown;
  toolName: string;
  toolCallId: string;
  sessionId: string;
  paths?: PathsConfig;
  settings?: ToolOutputSettings | null;
}): Promise<string> {
  const text = serializeToolOutput(input.value);
  const settings = resolveToolOutputSettings(input.settings);
  if (text.length <= settings.maxChars) {
    return text;
  }
  let rel: string | null = null;
  try {
    rel = await writeToolOutputFile({
      paths: input.paths,
      sessionId: input.sessionId,
      toolName: input.toolName,
      toolCallId: input.toolCallId,
      text,
    });
  } catch {
    rel = null;
  }
  return formatClipped(text, settings, rel);
}
export async function presentCallOutput(
  ctx: {
    sessionId: string;
    paths?: PathsConfig;
    toolOutput?: ToolOutputSettings | null;
  },
  call: {
    id: string;
    name: string;
  },
  value: unknown,
): Promise<string> {
  return await presentToolOutput({
    value,
    toolName: call.name,
    toolCallId: call.id,
    sessionId: ctx.sessionId,
    paths: ctx.paths,
    settings: ctx.toolOutput,
  });
}
async function writeToolOutputFile(input: {
  paths?: PathsConfig;
  sessionId: string;
  toolName: string;
  toolCallId: string;
  text: string;
}): Promise<string | null> {
  const cwd = input.paths?.cwd;
  if (!cwd || !input.sessionId) {
    return null;
  }
  const rel = toolOutputRelPath(
    input.sessionId,
    toolOutputFileName(input.toolName, input.toolCallId),
  );
  const absolute = resolveWorkdirPath(cwd, rel);
  await mkdir(path.dirname(absolute), { recursive: true });
  await Bun.write(absolute, input.text);
  return rel;
}
function formatClipped(
  text: string,
  settings: ResolvedToolOutputSettings,
  relPath: string | null,
): string {
  const head = text.slice(0, settings.headChars);
  const tail = text.slice(-settings.tailChars);
  const omitted = Math.max(0, text.length - settings.headChars - settings.tailChars);
  const fileLine = relPath
    ? `Full output (${text.length} chars): ${relPath}`
    : `Full output (${text.length} chars) was not saved to a file.`;
  return `${head}\n\n… ${omitted} chars omitted …\n\n${tail}\n\n${fileLine}`;
}
function safeSegment(value: string, fallback: string): string {
  const cleaned = value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
