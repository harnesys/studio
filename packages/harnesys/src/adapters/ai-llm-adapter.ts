import { streamText } from 'ai';
import type { AgentGenerationSettings } from '../domain/agent-definition.ts';
import type { ModelBinding } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { type StreamChunk, toAiTools } from './ai-llm-chunks.ts';
import { toModelMessages } from './ai-llm-messages.ts';
import { buildProvider, effortStreamOptions } from './ai-llm-provider.ts';
import {
  consumeParts,
  emptyStreamState,
  type PartContext,
  type StreamState,
} from './ai-llm-stream-parts.ts';

export type { CallModelResult, StreamChunk } from './ai-llm-chunks.ts';
export type CallModelSettings = {
  effort?: string;
  generation?: AgentGenerationSettings;
};
export type CallModelOptions = {
  binding: ModelBinding;
  prompt: string;
  messages: unknown[];
  toolNames: string[] | Map<string, ToolDefinition>;
  signalOrRegistry: AbortSignal | Map<string, ToolDefinition> | undefined;
  maybeSignal?: AbortSignal;
  outputSchema?: Record<string, unknown>;
  settings?: CallModelSettings;
};
function applyGeneration(
  streamConfig: Record<string, unknown>,
  generation: AgentGenerationSettings | undefined,
): void {
  if (!generation) {
    return;
  }
  if (generation.temperature !== undefined) {
    streamConfig.temperature = generation.temperature;
  }
  if (generation.topP !== undefined) {
    streamConfig.topP = generation.topP;
  }
  if (generation.topK !== undefined) {
    streamConfig.topK = generation.topK;
  }
  if (generation.frequencyPenalty !== undefined) {
    streamConfig.frequencyPenalty = generation.frequencyPenalty;
  }
  if (generation.presencePenalty !== undefined) {
    streamConfig.presencePenalty = generation.presencePenalty;
  }
  if (generation.seed !== undefined) {
    streamConfig.seed = generation.seed;
  }
  if (generation.maxTokens !== undefined) {
    streamConfig.maxOutputTokens = generation.maxTokens;
  }
}
type CallContext = {
  names: string[];
  registry: Map<string, ToolDefinition> | undefined;
  signal: AbortSignal | undefined;
};
function resolveCallContext(options: CallModelOptions): CallContext {
  let names: string[] = [];
  let registry: Map<string, ToolDefinition> | undefined;
  let signal: AbortSignal | undefined;
  if (Array.isArray(options.toolNames)) {
    names = options.toolNames;
  } else if (options.toolNames instanceof Map) {
    registry = options.toolNames;
  }
  if (options.signalOrRegistry instanceof Map) {
    registry = options.signalOrRegistry;
    signal = options.maybeSignal;
  } else if (options.signalOrRegistry) {
    signal = options.signalOrRegistry;
    if (options.maybeSignal instanceof Map) {
      registry = options.maybeSignal;
    }
  }
  return { names, registry, signal };
}
function testDriverChunks(names: string[]): StreamChunk[] {
  if (names.length > 0) {
    return [
      {
        type: 'completed',
        finishReason: 'tool-calls',
        text: '',
        toolCalls: names.map((name, i) => ({
          name,
          args: { msg: 'hello' },
          id: `tc-${i}`,
        })),
      },
    ];
  }
  return [{ type: 'completed', finishReason: 'stop', text: 'hello' }];
}
function buildStreamConfig(
  options: CallModelOptions,
  context: CallContext,
): Record<string, unknown> {
  const provider = buildProvider(options.binding);
  const model = provider(options.binding.model.name) as never;
  const aiTools = toAiTools(context.names, context.registry);
  const ms = toModelMessages(options.messages).filter((message) => {
    const role = (message as Record<string, unknown>).role;
    return role !== 'system';
  }) as never[];
  const instructions = options.prompt.trim() ? options.prompt : undefined;
  const streamConfig: Record<string, unknown> = {
    model,
    instructions,
    messages: ms.length > 0 ? ms : undefined,
    prompt: ms.length === 0 && instructions ? instructions : undefined,
    tools: aiTools as never,
    abortSignal: context.signal,
  };
  const effortOptions = effortStreamOptions(options.binding, options.settings?.effort);
  if (effortOptions.reasoning !== undefined) {
    streamConfig.reasoning = effortOptions.reasoning;
  }
  if (effortOptions.providerOptions !== undefined) {
    streamConfig.providerOptions = effortOptions.providerOptions;
  }
  applyGeneration(streamConfig, options.settings?.generation);
  if (options.outputSchema) {
    streamConfig.response_format = {
      type: 'json_schema',
      schema: options.outputSchema,
    };
  }
  return streamConfig;
}
async function resolveStructured(result: unknown): Promise<unknown> {
  try {
    const object = await (result as { object?: PromiseLike<unknown> }).object;
    if (object !== undefined) {
      return object;
    }
  } catch {}
  return undefined;
}
async function resolveUsage(result: unknown): Promise<unknown> {
  let usage: unknown = (globalThis as Record<string, unknown>).__harnesys_last_usage;
  try {
    const total = await (result as { totalUsage?: PromiseLike<unknown> }).totalUsage;
    if (total) {
      usage = total;
    }
  } catch {}
  try {
    const single = await (result as { usage?: PromiseLike<unknown> }).usage;
    if (single && !usage) {
      usage = single;
    }
  } catch {}
  return usage;
}
async function completedChunk(result: unknown, state: StreamState): Promise<StreamChunk> {
  let finishReason = state.finishReason;
  if (state.toolCalls.length > 0 && finishReason !== 'tool-calls' && finishReason !== 'length') {
    finishReason = 'tool-calls';
  }
  const structured = await resolveStructured(result);
  const usage = await resolveUsage(result);
  return {
    type: 'completed',
    finishReason,
    text: state.fullText || undefined,
    reasoning: state.reasoningText || undefined,
    toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
    structured,
    sources: state.sources.length > 0 ? state.sources : undefined,
    files: state.files.length > 0 ? state.files : undefined,
    usage,
  };
}
export async function* callModel(options: CallModelOptions): AsyncGenerator<StreamChunk> {
  const context = resolveCallContext(options);
  const driver = options.binding.driver as string;
  if (driver === 'test' || options.binding.name === 'test') {
    for (const chunk of testDriverChunks(context.names)) {
      yield chunk;
    }
    return;
  }
  const streamConfig = buildStreamConfig(options, context);
  const result = (await streamText(streamConfig as never)) as never;
  const state = emptyStreamState();
  const parts = (result as { stream: AsyncIterable<Record<string, unknown>> }).stream;
  const partContext: PartContext = { registry: context.registry, state };
  yield* consumeParts(parts, partContext);
  if (state.chunkBuffer) {
    yield { type: 'chunk', text: state.chunkBuffer, chunkId: crypto.randomUUID() };
  }
  yield await completedChunk(result, state);
}
