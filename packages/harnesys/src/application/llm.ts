import { callModel, type StreamChunk } from '../adapters/ai-llm-adapter.ts';
import type { AgentDefinition, AgentModelRef } from '../domain/agent-definition.ts';
import type { ModelBinding } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { evalExpr, substitutePrompt } from './expr-eval.ts';
import { stateKeyOf } from './graph-helpers.ts';
import { assembleNotes, type LlmNote } from './llm-notes.ts';
import { composeSystemPrompt } from './packs/prompt.ts';
import type { ResolvedCapability } from './packs/registry.ts';
import { formatDeferredCatalog, loadedToolsOf, resolveProgressiveTools } from './tools/exposure.ts';

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
  notes?: LlmNote[];
  notesErrors?: string[];
  capabilities?: ResolvedCapability[];
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
  const key = stateKeyOf(node.messages);
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

const LLM_CHUNK_EVENTS: Record<string, string> = {
  delta: 'model.delta',
  'reasoning-delta': 'model.reasoning',
  'reasoning-start': 'model.reasoning-start',
  'reasoning-end': 'model.reasoning-end',
  'tool-input-start': 'model.tool-input-start',
  'tool-input-delta': 'model.tool-input-delta',
  'tool-input-end': 'model.tool-input-end',
  'tool-call': 'model.tool-call',
  source: 'model.source',
  file: 'model.file',
  chunk: 'model.chunk',
};

export async function* runLlmGenerate(
  node: LlmNode,
  ctx: LlmContext,
): AsyncGenerator<{ type: string; data?: unknown }> {
  ensureMessages(node, ctx.state, ctx.input);

  const promptDef = ctx.agent.prompts[node.prompt];
  const agentText = promptDef ? promptDef.instructions : '';
  const slots = {
    input: ctx.input,
    state: ctx.state,
    output: ctx.output ?? null,
    resume: null,
  };
  const prompt = substitutePrompt(composeSystemPrompt(agentText, ctx.capabilities ?? []), slots);
  const messages = projectCompacted(resolveMessages(node, ctx));
  const resolved = node.tools === undefined ? [...ctx.toolRegistry.keys()] : (node.tools ?? []);
  // Прогрессивный набор применяется только к «всем тулам реестра»; явный
  // node.tools кастомного графа — контракт автора, без инъекций.
  const progressive =
    node.tools === undefined
      ? resolveProgressiveTools(resolved, ctx.toolRegistry, loadedToolsOf(ctx.state))
      : { toolNames: resolved, deferredPending: [] as string[] };
  const toolNames = progressive.toolNames;

  const allNotes = ctx.notes ? [...ctx.notes] : [];
  if (progressive.deferredPending.length > 0) {
    allNotes.push({
      tag: 'tools',
      text: formatDeferredCatalog(progressive.deferredPending, ctx.toolRegistry),
    });
  }
  const requestMessages = allNotes.length
    ? [...messages, { role: 'system', content: assembleNotes(allNotes) }]
    : messages;

  yield {
    type: 'model.stats',
    data: {
      tools: toolNames.length,
      deferredPending: progressive.deferredPending.length,
      systemChars: prompt.length,
      notesChars: allNotes.reduce((sum, n) => sum + n.text.length, 0),
      notesErrors: ctx.notesErrors ?? [],
    },
  };

  const stream = callModel(
    ctx.modelBinding,
    prompt,
    requestMessages,
    toolNames,
    ctx.toolRegistry,
    ctx.signal,
    node.output as Record<string, unknown> | undefined,
  );

  let lastChunk: StreamChunk | undefined;
  for await (const chunk of stream) {
    const type = LLM_CHUNK_EVENTS[chunk.type];
    if (type) {
      yield { type, data: chunk };
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

/**
 * Последний якорь (kind:'compaction') поднимается как system-ход,
 * ходы до coveredUntil и сам слот якоря выпадают, хвост остаётся.
 * Без якорей массив возвращается как есть.
 */
export function projectCompacted(messages: readonly unknown[]): unknown[] {
  let anchorIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Record<string, unknown> | null | undefined;
    if (m && typeof m === 'object' && m.kind === 'compaction') {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) {
    return [...messages];
  }
  const anchor = messages[anchorIndex] as Record<string, unknown>;
  const until = typeof anchor.coveredUntil === 'number' ? anchor.coveredUntil : -1;
  const out: unknown[] = [{ role: 'system', content: String(anchor.content ?? '') }];
  for (let i = 0; i < messages.length; i++) {
    if (i === anchorIndex || i <= until) {
      continue;
    }
    out.push(messages[i]);
  }
  return out;
}
