import { createAlibaba } from '@ai-sdk/alibaba';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMiniMax } from '@ai-sdk/minimax';
import { createMistral } from '@ai-sdk/mistral';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { streamText, tool } from 'ai';
import type { ModelBinding } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';

export type CallModelResult = {
  finishReason: string;
  text?: string;
  toolCalls?: { name: string; args: unknown; id: string }[];
  structured?: unknown;
};

export type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'chunk'; text: string; chunkId: string }
  | {
      type: 'completed';
      finishReason: string;
      text?: string;
      toolCalls?: { name: string; args: unknown; id: string }[];
      structured?: unknown;
    };

const STREAM_CHUNK_SIZE = 6;

function buildProvider(binding: ModelBinding): (modelId: string) => unknown {
  const opts = {
    apiKey: binding.apiKey,
    baseURL: binding.apiUrl,
    headers: binding.headers,
  };
  const driver = binding.driver as string;
  switch (driver) {
    case 'openai':
      return (m: string) => createOpenAI(opts as never)(m);
    case 'openai-compatible':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? 'http://localhost',
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'anthropic':
      return (m: string) => createAnthropic(opts as never)(m);
    case 'google':
      return (m: string) => createGoogleGenerativeAI(opts as never)(m);
    case 'mistral':
      return (m: string) => createMistral(opts as never)(m);
    case 'xai':
      return (m: string) => createXai(opts as never)(m);
    case 'minimax':
      return (m: string) => createMiniMax(opts as never)(m);
    case 'alibaba':
    case 'qwen':
      return (m: string) => createAlibaba(opts as never)(m);
    case 'moonshotai':
    case 'moonshot':
    case 'kimi':
      return (m: string) => createMoonshotAI(opts as never)(m);
    default:
      throw Object.assign(new Error(`unsupported driver ${driver}`), {
        code: 'model_unresolved',
      });
  }
}

function toAiTools(
  names: string[],
  registry: Map<string, ToolDefinition> | undefined,
): Record<string, unknown> | undefined {
  if (names.length === 0) {
    return undefined;
  }
  if (!registry) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const n of names) {
    const def = registry.get(n);
    if (!def) {
      continue;
    }
    out[n] = tool({
      description: def.description,
      inputSchema: def.input as never,
    });
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

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
      registry = maybeSignal as unknown as Map<string, ToolDefinition>;
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

  const ms = messages as never[];
  const streamConfig: Record<string, unknown> = {
    model,
    system: prompt || undefined,
    messages: ms.length > 0 ? ms : undefined,
    prompt: ms.length === 0 && prompt ? prompt : undefined,
    tools: aiTools as never,
    abortSignal: signal,
  };

  if (outputSchema) {
    streamConfig.response_format = {
      type: 'json_schema',
      schema: outputSchema,
    };
  }

  const result = await streamText(streamConfig as never);

  let fullText = '';
  const toolCalls: { name: string; args: unknown; id: string }[] = [];
  let finishReason = 'stop';
  let chunkBuffer = '';
  let chunkCount = 0;

  if (result && typeof (result as unknown as { text?: unknown }).text === 'string') {
    fullText = (result as unknown as { text: string }).text;
  } else if (
    result &&
    typeof (result as unknown as { fullStream?: unknown }).fullStream !== 'undefined'
  ) {
    for await (const chunk of (
      result as unknown as {
        fullStream: AsyncIterable<{
          type: string;
          text?: string;
          toolName?: string;
          args?: unknown;
          toolCallId?: string;
        }>;
      }
    ).fullStream) {
      if (chunk.type === 'text-delta' && chunk.text) {
        fullText += chunk.text;
        chunkBuffer += chunk.text;
        chunkCount++;

        yield { type: 'delta', text: chunk.text };

        if (chunkCount >= STREAM_CHUNK_SIZE) {
          yield { type: 'chunk', text: chunkBuffer, chunkId: crypto.randomUUID() };
          chunkBuffer = '';
          chunkCount = 0;
        }
      }
      if (chunk.type === 'tool-call') {
        toolCalls.push({
          name: chunk.toolName as string,
          args: chunk.args,
          id: chunk.toolCallId as string,
        });
      }
    }
    if (chunkBuffer) {
      yield { type: 'chunk', text: chunkBuffer, chunkId: crypto.randomUUID() };
    }
    const fr = await (result as unknown as { finishReason?: Promise<string> }).finishReason;
    if (typeof fr === 'string') {
      finishReason = fr;
    } else if (toolCalls.length > 0) {
      finishReason = 'tool-calls';
    }
  } else {
    const fr = await (result as unknown as { finishReason?: Promise<string> }).finishReason;
    if (typeof fr === 'string') {
      finishReason = fr;
    }
    try {
      const tc = await (result as unknown as { toolCalls?: Promise<unknown[]> }).toolCalls;
      if (Array.isArray(tc)) {
        for (const t of tc as { toolName: string; args: unknown; toolCallId: string }[]) {
          toolCalls.push({ name: t.toolName, args: t.args, id: t.toolCallId });
        }
        if (toolCalls.length > 0 && finishReason === 'stop') {
          finishReason = 'tool-calls';
        }
      }
    } catch {
      // ignore
    }
    try {
      const txt = await (result as unknown as { text?: Promise<string> }).text;
      if (typeof txt === 'string') {
        fullText = txt;
      }
    } catch {
      // ignore
    }
  }

  let structured: unknown;
  try {
    const obj = await (result as unknown as { object?: Promise<unknown> }).object;
    if (obj !== undefined) {
      structured = obj;
    }
  } catch {
    // not all providers support structured output
  }

  yield {
    type: 'completed',
    finishReason,
    text: fullText || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    structured,
  };
}
