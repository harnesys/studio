import { STREAM_CHUNK_SIZE } from '../constants.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { canonicalToolName, type StreamChunk, toStreamError } from './ai-llm-chunks.ts';

export type ToolCallRecord = {
  name: string;
  args: unknown;
  id: string;
};
export type StreamState = {
  fullText: string;
  reasoningText: string;
  toolCalls: ToolCallRecord[];
  sources: unknown[];
  files: unknown[];
  finishReason: string;
  chunkBuffer: string;
  chunkCount: number;
};
export type PartContext = {
  registry: Map<string, ToolDefinition> | undefined;
  state: StreamState;
};
export function emptyStreamState(): StreamState {
  return {
    fullText: '',
    reasoningText: '',
    toolCalls: [],
    sources: [],
    files: [],
    finishReason: 'stop',
    chunkBuffer: '',
    chunkCount: 0,
  };
}
function handleTextDelta(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  if (typeof part.text !== 'string' || !part.text) {
    return [];
  }
  const text = part.text;
  const id = String(part.id ?? '');
  context.state.fullText += text;
  context.state.chunkBuffer += text;
  context.state.chunkCount++;
  const chunks: StreamChunk[] = [{ type: 'delta', text, id }];
  if (context.state.chunkCount >= STREAM_CHUNK_SIZE) {
    chunks.push({
      type: 'chunk',
      text: context.state.chunkBuffer,
      chunkId: crypto.randomUUID(),
    });
    context.state.chunkBuffer = '';
    context.state.chunkCount = 0;
  }
  return chunks;
}
function handleReasoningDelta(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  if (typeof part.text !== 'string' || !part.text) {
    return [];
  }
  const text = part.text;
  const id = String(part.id ?? '');
  context.state.reasoningText += text;
  return [{ type: 'reasoning-delta', text, id }];
}
function handleReasoningMarker(part: Record<string, unknown>): StreamChunk[] {
  const type = part.type as 'reasoning-start' | 'reasoning-end';
  return [{ type, id: String(part.id ?? '') }];
}
function handleToolInputStart(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  return [
    {
      type: 'tool-input-start',
      id: String(part.id ?? part.toolCallId ?? ''),
      toolName: canonicalToolName(String(part.toolName ?? ''), context.registry),
    },
  ];
}
function handleToolInputDelta(part: Record<string, unknown>): StreamChunk[] {
  const delta =
    (typeof part.delta === 'string' ? part.delta : undefined) ??
    (typeof part.inputTextDelta === 'string' ? part.inputTextDelta : undefined) ??
    '';
  if (!delta) {
    return [];
  }
  return [{ type: 'tool-input-delta', id: String(part.id ?? part.toolCallId ?? ''), delta }];
}
function handleToolInputEnd(part: Record<string, unknown>): StreamChunk[] {
  return [{ type: 'tool-input-end', id: String(part.id ?? part.toolCallId ?? '') }];
}
function handleToolCall(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  const tc = part as {
    toolName?: string;
    input?: unknown;
    args?: unknown;
    toolCallId?: string;
    id?: string;
  };
  const name = canonicalToolName(String(tc.toolName ?? ''), context.registry);
  const args = (tc.input ?? tc.args) as unknown;
  const id = String(tc.toolCallId ?? tc.id ?? '');
  context.state.toolCalls.push({ name, args, id });
  return [{ type: 'tool-call', name, args, id }];
}
function handleSource(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  const source = (part as { source?: unknown }).source ?? part;
  context.state.sources.push(source);
  return [{ type: 'source', source }];
}
function handleFile(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  const file = (part as { file?: unknown }).file ?? part;
  context.state.files.push(file);
  return [{ type: 'file', file }];
}
function handleFinishStep(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  const finishReason = part.finishReason as string | undefined;
  if (finishReason) {
    context.state.finishReason = finishReason;
  }
  return [];
}
function handleFinish(part: Record<string, unknown>, context: PartContext): StreamChunk[] {
  const finishReason = part.finishReason as string | undefined;
  if (finishReason) {
    context.state.finishReason = finishReason;
  }
  const usage =
    (part as { totalUsage?: unknown }).totalUsage ?? (part as { usage?: unknown }).usage;
  if (usage) {
    (globalThis as Record<string, unknown>).__harnesys_last_usage = usage;
  }
  return [];
}
function handleError(part: Record<string, unknown>): StreamChunk[] {
  throw toStreamError((part as { error?: unknown }).error);
}
function handleAbort(part: Record<string, unknown>): StreamChunk[] {
  throw Object.assign(new Error(String((part as { reason?: string }).reason ?? 'aborted')), {
    name: 'AbortError',
  });
}
type PartHandler = (part: Record<string, unknown>, context: PartContext) => StreamChunk[];
const PART_HANDLERS: Record<string, PartHandler> = {
  'text-delta': handleTextDelta,
  'reasoning-delta': handleReasoningDelta,
  'reasoning-start': handleReasoningMarker,
  'reasoning-end': handleReasoningMarker,
  'tool-input-start': handleToolInputStart,
  'tool-input-delta': handleToolInputDelta,
  'tool-input-end': handleToolInputEnd,
  'tool-call': handleToolCall,
  source: handleSource,
  file: handleFile,
  'reasoning-file': handleFile,
  'finish-step': handleFinishStep,
  finish: handleFinish,
  error: handleError,
  abort: handleAbort,
};
export async function* consumeParts(
  parts: AsyncIterable<Record<string, unknown>>,
  context: PartContext,
): AsyncGenerator<StreamChunk> {
  for await (const part of parts) {
    const handler = PART_HANDLERS[part.type as string];
    if (!handler) {
      continue;
    }
    for (const chunk of handler(part, context)) {
      yield chunk;
    }
  }
}
