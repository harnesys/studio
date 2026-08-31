import { callModel, type StreamChunk } from '../adapters/ai-llm-adapter.ts';
import type { AgentDefinition, AgentModelRef } from '../domain/agent-definition.ts';
import type { ModelBinding } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { evalExpr, substitutePrompt } from './expr-eval.ts';

export type LlmNode = {
  type: 'llm:generate';
  prompt: string;
  messages?: string;
  tools?: string[];
  model?: string | AgentModelRef;
  output?: unknown;
};

export type LlmContext = {
  agent: AgentDefinition;
  state: Record<string, unknown>;
  input: unknown;
  output?: unknown;
  modelBinding: ModelBinding;
  toolRegistry: Map<string, ToolDefinition>;
  signal: AbortSignal;
};

export type LlmResult = {
  finishReason: string;
  text?: string;
  reasoning?: string;
  toolCalls?: unknown[];
  structured?: unknown;
  sources?: unknown[];
  files?: unknown[];
  usage?: unknown;
  outputReserved?: boolean;
};

function ensureMessages(node: LlmNode, state: Record<string, unknown>, input: unknown): void {
  if (!node.messages) {
    return;
  }
  const key = node.messages
    .trim()
    .replace(/^\$state\./, '')
    .split(/[.[]/)[0] as string;
  if (!key) {
    return;
  }
  if (state[key] !== undefined) {
    return;
  }
  const inp = input as { messages?: unknown };
  state[key] = Array.isArray(inp?.messages) ? [...(inp.messages as unknown[])] : [];
}

function resolveMessages(node: LlmNode, ctx: LlmContext): unknown[] {
  if (!node.messages) {
    return [];
  }
  try {
    const v = evalExpr(node.messages, {
      input: ctx.input,
      state: ctx.state,
      output: ctx.output ?? null,
      resume: null,
    });
    return Array.isArray(v) ? (v as unknown[]) : [];
  } catch {
    return [];
  }
}

export async function* runLlmGenerate(
  node: LlmNode,
  ctx: LlmContext,
): AsyncGenerator<{ type: string; data?: unknown }> {
  ensureMessages(node, ctx.state, ctx.input);

  const promptDef = ctx.agent.prompts[node.prompt];
  const rawInstructions = promptDef ? promptDef.instructions : '';
  const slots = {
    input: ctx.input,
    state: ctx.state,
    output: ctx.output ?? null,
    resume: null,
  };
  const prompt = substitutePrompt(rawInstructions, slots);
  const messages = resolveMessages(node, ctx);
  const toolNames = node.tools === undefined ? [...ctx.toolRegistry.keys()] : (node.tools ?? []);

  const stream = callModel(
    ctx.modelBinding,
    prompt,
    messages,
    toolNames,
    ctx.toolRegistry,
    ctx.signal,
    node.output as Record<string, unknown> | undefined,
  );

  let lastChunk: StreamChunk | undefined;
  for await (const chunk of stream) {
    if (chunk.type === 'delta') {
      yield { type: 'model.delta', data: chunk };
    } else if (chunk.type === 'reasoning-delta') {
      yield { type: 'model.reasoning', data: chunk };
    } else if (chunk.type === 'reasoning-start') {
      yield { type: 'model.reasoning-start', data: chunk };
    } else if (chunk.type === 'reasoning-end') {
      yield { type: 'model.reasoning-end', data: chunk };
    } else if (chunk.type === 'tool-input-start') {
      yield { type: 'model.tool-input-start', data: chunk };
    } else if (chunk.type === 'tool-input-delta') {
      yield { type: 'model.tool-input-delta', data: chunk };
    } else if (chunk.type === 'tool-input-end') {
      yield { type: 'model.tool-input-end', data: chunk };
    } else if (chunk.type === 'tool-call') {
      yield { type: 'model.tool-call', data: chunk };
    } else if (chunk.type === 'source') {
      yield { type: 'model.source', data: chunk };
    } else if (chunk.type === 'file') {
      yield { type: 'model.file', data: chunk };
    } else if (chunk.type === 'chunk') {
      yield { type: 'model.chunk', data: chunk };
    } else if (chunk.type === 'completed') {
      lastChunk = chunk;
    }
  }

  if (lastChunk && lastChunk.type === 'completed') {
    const res = lastChunk;

    let structured: unknown;
    let outputReserved = false;
    if (res.structured && typeof res.structured === 'object' && res.structured !== null) {
      const s = res.structured as Record<string, unknown>;
      if ('finishReason' in s || 'text' in s || 'toolCalls' in s) {
        outputReserved = true;
      }
      structured = res.structured;
    }

    const out: LlmResult = {
      finishReason: res.finishReason,
      text: res.text,
      reasoning: res.reasoning,
      toolCalls: res.toolCalls as unknown[] | undefined,
      structured,
      sources: res.sources,
      files: res.files,
      usage: res.usage,
      outputReserved,
    };

    if (structured && typeof structured === 'object' && structured !== null) {
      const rec = structured as Record<string, unknown>;
      for (const [k, v] of Object.entries(rec)) {
        if (k === 'finishReason' || k === 'text' || k === 'toolCalls') {
          continue;
        }
        (out as Record<string, unknown>)[k] = v;
      }
    }

    yield { type: 'model.completed', data: out };
  }
}
