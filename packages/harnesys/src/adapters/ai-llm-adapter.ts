import { streamText } from 'ai';
import { STREAM_CHUNK_SIZE } from '../constants.ts';
import type { ModelBinding } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { type StreamChunk, toAiTools } from './ai-llm-chunks.ts';
import { toModelMessages } from './ai-llm-messages.ts';
import { buildProvider } from './ai-llm-provider.ts';

export type { CallModelResult, StreamChunk } from './ai-llm-chunks.ts';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapter orchestration
// biome-ignore lint/complexity/useMaxParams: flexible overload needs 6 params for test vs prod
export async function* callModel(
  binding: ModelBinding,
  prompt: string,
  messages: unknown[],
  toolNames: string[] | Map<string, ToolDefinition>,
  signalOrRegistry: AbortSignal | Map<string, ToolDefinition> | undefined,
  maybeSignal?: AbortSignal,
  outputSchema?: Record<string, unknown>,
): AsyncGenerator<StreamChunk> {
  let names: string[] = [];
  let registry: Map<string, ToolDefinition> | undefined;
  let signal: AbortSignal | undefined;

  if (Array.isArray(toolNames)) {
    names = toolNames;
  } else if (toolNames instanceof Map) {
    registry = toolNames as Map<string, ToolDefinition>;
  }

  if (signalOrRegistry instanceof Map) {
    registry = signalOrRegistry as Map<string, ToolDefinition>;
    signal = maybeSignal;
  } else if (signalOrRegistry) {
    signal = signalOrRegistry as AbortSignal;
    if (maybeSignal instanceof Map) {
      registry = maybeSignal as Map<string, ToolDefinition>;
    }
  }

  const driver = binding.driver as string;
  if (driver === 'test' || binding.name === 'test') {
    if (names.length > 0) {
      yield {
        type: 'completed',
        finishReason: 'tool-calls',
        text: '',
        toolCalls: names.map((name, i) => ({
          name,
          args: { msg: 'hello' },
          id: `tc-${i}`,
        })),
      };
      return;
    }
    yield { type: 'completed', finishReason: 'stop', text: 'hello' };
    return;
  }

  const provider = buildProvider(binding);
  const model = provider(binding.model.name) as never;
  const aiTools = toAiTools(names, registry);

  const raw = toModelMessages(messages);
  const chat: unknown[] = [];
  const noteTexts: string[] = [];
  for (const message of raw) {
    const record = message as Record<string, unknown>;
    if (record && record.role === 'system') {
      const text = typeof record.content === 'string' ? record.content : '';
      if (text.trim()) {
        noteTexts.push(text);
      }
      continue;
    }
    chat.push(message);
  }
  const systemText = [prompt, ...noteTexts].filter((part) => part?.trim()).join('\n\n');
  const ms = chat as never[];

  const streamConfig: Record<string, unknown> = {
    model,
    system: systemText || undefined,
    messages: ms.length > 0 ? ms : undefined,
    prompt: ms.length === 0 && systemText ? systemText : undefined,
    tools: aiTools as never,
    abortSignal: signal,
  };

  if (outputSchema) {
    streamConfig.response_format = {
      type: 'json_schema',
      schema: outputSchema,
    };
  }

  const result = (await streamText(streamConfig as never)) as never;

  let fullText = '';
  let reasoningText = '';
  const toolCalls: { name: string; args: unknown; id: string }[] = [];
  const sources: unknown[] = [];
  const files: unknown[] = [];
  let finishReason = 'stop';
  let chunkBuffer = '';
  let chunkCount = 0;

  for await (const part of (result as { stream: AsyncIterable<Record<string, unknown>> }).stream) {
    const type = part.type as string;

    if (type === 'text-delta' && typeof part.text === 'string' && part.text) {
      const text = part.text as string;
      const id = String(part.id ?? '');
      fullText += text;
      chunkBuffer += text;
      chunkCount++;
      yield { type: 'delta', text, id };
      if (chunkCount >= STREAM_CHUNK_SIZE) {
        yield { type: 'chunk', text: chunkBuffer, chunkId: crypto.randomUUID() };
        chunkBuffer = '';
        chunkCount = 0;
      }
      continue;
    }

    if (type === 'reasoning-delta' && typeof part.text === 'string' && part.text) {
      const text = part.text as string;
      const id = String(part.id ?? '');
      reasoningText += text;
      yield { type: 'reasoning-delta', text, id };
      continue;
    }

    if (type === 'reasoning-start') {
      yield { type: 'reasoning-start', id: String(part.id ?? '') };
      continue;
    }

    if (type === 'reasoning-end') {
      yield { type: 'reasoning-end', id: String(part.id ?? '') };
      continue;
    }

    if (type === 'tool-input-start') {
      yield {
        type: 'tool-input-start',
        id: String(part.id ?? part.toolCallId ?? ''),
        toolName: String(part.toolName ?? ''),
      };
      continue;
    }

    if (type === 'tool-input-delta') {
      const delta =
        (typeof part.delta === 'string' ? (part.delta as string) : undefined) ??
        (typeof part.inputTextDelta === 'string' ? (part.inputTextDelta as string) : undefined) ??
        '';
      if (delta) {
        yield { type: 'tool-input-delta', id: String(part.id ?? part.toolCallId ?? ''), delta };
      }
      continue;
    }

    if (type === 'tool-input-end') {
      yield { type: 'tool-input-end', id: String(part.id ?? part.toolCallId ?? '') };
      continue;
    }

    if (type === 'tool-call') {
      const tc = part as {
        toolName?: string;
        input?: unknown;
        args?: unknown;
        toolCallId?: string;
        id?: string;
      };
      toolCalls.push({
        name: String(tc.toolName ?? ''),
        args: (tc.input ?? tc.args) as unknown,
        id: String(tc.toolCallId ?? tc.id ?? ''),
      });
      yield {
        type: 'tool-call',
        name: String(tc.toolName ?? ''),
        args: (tc.input ?? tc.args) as unknown,
        id: String(tc.toolCallId ?? tc.id ?? ''),
      };
      continue;
    }

    if (type === 'source') {
      const src = (part as { source?: unknown }).source ?? part;
      sources.push(src);
      yield { type: 'source', source: src };
      continue;
    }

    if (type === 'file' || type === 'reasoning-file') {
      const f = (part as { file?: unknown }).file ?? part;
      files.push(f);
      yield { type: 'file', file: f };
      continue;
    }

    if (type === 'finish-step') {
      const fr = part.finishReason as string | undefined;
      if (fr) {
        finishReason = fr;
      }
      const usage = (part as { usage?: unknown }).usage;
      if (usage) {
        // keep last step usage, final finish will override
      }
      continue;
    }

    if (type === 'finish') {
      const fr = part.finishReason as string | undefined;
      if (fr) {
        finishReason = fr;
      }
      const usage =
        (part as { totalUsage?: unknown; usage?: unknown }).totalUsage ??
        (part as { usage?: unknown }).usage;
      if (usage) {
        // store for completed
        (globalThis as Record<string, unknown>).__harnesys_last_usage = usage;
      }
      continue;
    }

    if (type === 'error') {
      throw (part as { error?: unknown }).error ?? new Error(String(part.error ?? 'stream error'));
    }

    if (type === 'abort') {
      throw Object.assign(new Error(String((part as { reason?: string }).reason ?? 'aborted')), {
        name: 'AbortError',
      });
    }
  }

  if (chunkBuffer) {
    yield { type: 'chunk', text: chunkBuffer, chunkId: crypto.randomUUID() };
  }

  // fallback finishReason from toolCalls
  if (toolCalls.length > 0 && finishReason === 'stop') {
    finishReason = 'tool-calls';
  }

  // also try result promises for usage/structured if not in stream
  let structured: unknown;
  try {
    const obj = await (result as { object?: PromiseLike<unknown> }).object;
    if (obj !== undefined) {
      structured = obj;
    }
  } catch {
    // ignore
  }

  let usage: unknown = (globalThis as Record<string, unknown>).__harnesys_last_usage;
  try {
    const u = await (result as { totalUsage?: PromiseLike<unknown> }).totalUsage;
    if (u) {
      usage = u;
    }
  } catch {
    // ignore
  }
  try {
    const u2 = await (result as { usage?: PromiseLike<unknown> }).usage;
    if (u2 && !usage) {
      usage = u2;
    }
  } catch {
    // ignore
  }

  yield {
    type: 'completed',
    finishReason,
    text: fullText || undefined,
    reasoning: reasoningText || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    structured,
    sources: sources.length > 0 ? sources : undefined,
    files: files.length > 0 ? files : undefined,
    usage,
  };
}
