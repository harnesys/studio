import { readFileSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import { callModel, type StreamChunk } from '../adapters/ai-llm-adapter.ts';
import { LLM_CHUNK_EVENTS, MIME_MAP } from '../constants.ts';
import type { AgentDefinition, AgentModelRef } from '../domain/agent-definition.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { ModelBinding } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { evalExpr, substitutePrompt } from './expr-eval.ts';
import { type AttachmentReadFn, materializeMessageAttachments } from './fold-attachments.ts';
import { resolveAgentModelRef, stateKeyOf } from './graph-helpers.ts';
import { assembleNotes, type LlmNote } from './llm-notes.ts';
import { effectiveSkillRegistry, type PackRunOutput } from './packs/pack-run.ts';
import { formatSkillsCatalog } from './skills/skills-catalog.ts';
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
  packOutputs?: PackRunOutput[];
  /** FS skill registry (raw); narrowed per agent + pack skills for the prompt section. */
  skills?: SkillRegistry;
  artifacts?: ArtifactStore;
  paths?: PathsConfig;
};

function attachmentReader(
  artifacts: ArtifactStore | undefined,
  paths: PathsConfig | undefined,
): AttachmentReadFn {
  return (uri: string) => {
    if (artifacts) {
      return artifacts.read(uri);
    }
    const abs = isAbsolute(uri) ? uri : join(paths?.cwd ?? '', uri);
    const bytes = new Uint8Array(readFileSync(abs));
    return { bytes, mediaType: MIME_MAP[extname(abs).toLowerCase()] };
  };
}

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
  const prompt = substitutePrompt(agentText, slots);
  const projected = projectCompacted(resolveMessages(node, ctx));
  const skillsSection = ctx.skills
    ? formatSkillsCatalog(
        await effectiveSkillRegistry(ctx.agent, ctx.skills, ctx.packOutputs ?? []).list(),
      )
    : '';
  const instructions = [prompt, skillsSection, projected.prefix]
    .filter((part) => part.trim())
    .join('\n\n');
  const resolved = node.tools === undefined ? [...ctx.toolRegistry.keys()] : (node.tools ?? []);
  // Прогрессивный набор применяется к разрешённому списку всегда: явный
  // node.tools ограничивает видимость, но deferred-инструменты внутри него
  // по-прежнему подменяются каталогом через load_tools.
  const progressive = resolveProgressiveTools(resolved, ctx.toolRegistry, loadedToolsOf(ctx.state));
  const toolNames = progressive.toolNames;

  const allNotes = ctx.notes ? [...ctx.notes] : [];
  if (progressive.deferredPending.length > 0) {
    allNotes.push({
      tag: 'tools',
      text: formatDeferredCatalog(progressive.deferredPending, ctx.toolRegistry),
    });
  }
  // [tools] [system/instructions] [messages] [tail]: volatile only in the tail;
  // ephemeral user for this call, not written to state.messages / transcript.
  const tailText = allNotes.length > 0 ? assembleNotes(allNotes) : '';
  const history = await materializeMessageAttachments(
    projected.messages,
    attachmentReader(ctx.artifacts, ctx.paths),
  );
  const requestMessages = tailText ? [...history, { role: 'user', content: tailText }] : history;

  yield {
    type: 'model.stats',
    data: {
      tools: toolNames.length,
      deferredPending: progressive.deferredPending.length,
      systemChars: instructions.length,
      notesChars: allNotes.reduce((sum, n) => sum + n.text.length, 0),
      notesErrors: ctx.notesErrors ?? [],
    },
  };

  const modelRef = resolveAgentModelRef(node.model, ctx.agent);
  const stream = callModel(
    ctx.modelBinding,
    instructions,
    requestMessages,
    toolNames,
    ctx.toolRegistry,
    ctx.signal,
    node.output as Record<string, unknown> | undefined,
    {
      effort: modelRef?.effort,
      generation: modelRef?.generation,
    },
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

/** Projection for the model call: stable prefix + chat without system roles. */
export type CompactedProjection = {
  /** Compaction summary merged into instructions (stable until next compaction). */
  prefix: string;
  /** History tail: user / assistant / tool only. */
  messages: unknown[];
};

/**
 * Последний якорь (kind:'compaction') уходит в `prefix` для instructions.
 * Ходы до coveredUntil и сам слот якоря выпадают, хвост остаётся в `messages`.
 * Без якорей: пустой prefix и копия массива.
 */
export function projectCompacted(messages: readonly unknown[]): CompactedProjection {
  let anchorIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Record<string, unknown> | null | undefined;
    if (m && typeof m === 'object' && m.kind === 'compaction') {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) {
    return { prefix: '', messages: [...messages] };
  }
  const anchor = messages[anchorIndex] as Record<string, unknown>;
  const until = typeof anchor.coveredUntil === 'number' ? anchor.coveredUntil : -1;
  const out: unknown[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (i === anchorIndex || i <= until) {
      continue;
    }
    out.push(messages[i]);
  }
  return { prefix: String(anchor.content ?? ''), messages: out };
}

/** Flatten projection for token estimates (prefix counted as one system-sized block). */
export function projectedForEstimate(projected: CompactedProjection): unknown[] {
  if (!projected.prefix.trim()) {
    return projected.messages;
  }
  return [{ role: 'system', content: projected.prefix }, ...projected.messages];
}
