import type { StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import type { AgentDefinition, AgentModelRef, PortRef } from '../../domain/agent-definition.ts';
import {
  type CompactionMessage,
  isCompactionMessage,
  type ParsedCompactionSpec,
  parseThresholdSpec,
  THRESHOLD_SUMMARY_NAME,
} from '../../domain/compaction.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../../ports/models.ts';
import type { PathsConfig } from '../../ports/paths.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { findBind, isPort, resolveModelForPort } from '../graph-helpers.ts';
import { projectCompacted } from '../llm.ts';
import { estimateTokens } from './estimate.ts';
import { writeCompactionFile } from './file-log.ts';
import { planCut } from './plan-cut.ts';
import { priorSummaryBlock, SUMMARY_SYSTEM_PROMPT, streamSummary } from './summarize.ts';

export type CompactionPassContext = {
  agent: AgentDefinition;
  state: Record<string, unknown>;
  sessionId: string;
  binding: ModelBinding;
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  paths?: PathsConfig;
  signal: AbortSignal;
};

export type CompactionPassEvent =
  | { type: 'completed'; message: CompactionMessage }
  | { type: 'failed'; error: string }
  | {
      type: 'model.delta' | 'model.reasoning' | 'model.reasoning-start' | 'model.reasoning-end';
      data: unknown;
    };

function findAnchorIndex(messages: readonly unknown[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isCompactionMessage(messages[i])) {
      return i;
    }
  }
  return -1;
}

function toolsJsonOf(registry: Map<string, ToolDefinition>): string {
  return JSON.stringify(
    [...registry.values()].map((t) => ({ name: t.name, description: t.description })),
  );
}

async function resolveSummaryBinding(
  ctx: CompactionPassContext,
  ref: AgentModelRef,
): Promise<ModelBinding> {
  if (isPort(ctx.models)) {
    const coords = resolveModelForPort(ref, ctx.agent);
    if (coords) {
      return await (ctx.models as ModelsPort).get(coords.provider, coords.model);
    }
  } else {
    const result = findBind(ctx.models as ProviderConfig[], ref, ctx.agent);
    if (result?.binding) {
      return result.binding;
    }
  }
  throw new Error(`summary model not found: ${ref.provider}/${ref.model}`);
}

async function* passIfDue(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
  reason: 'threshold' | 'manual',
): AsyncGenerator<CompactionPassEvent> {
  const messages = Array.isArray(ctx.state.messages) ? (ctx.state.messages as unknown[]) : null;
  if (!messages || messages.length === 0) {
    return;
  }
  if (ctx.state.$resume !== undefined) {
    return;
  }
  const toolsJson = toolsJsonOf(ctx.toolRegistry);
  const before = estimateTokens(projectCompacted(messages), toolsJson);
  const contextLength =
    ctx.binding.model.context_length ?? ctx.binding.model.top_provider?.context_length;
  if (!contextLength) {
    return;
  }
  if (reason === 'threshold') {
    const available = contextLength - spec.outputReserveTokens;
    if (available > 0 && before.total < available * spec.thresholdRatio) {
      return;
    }
  }
  const anchorIndex = findAnchorIndex(messages);
  const anchor = anchorIndex >= 0 ? (messages[anchorIndex] as CompactionMessage) : undefined;
  const afterIndex = anchor ? anchor.coveredUntil : -1;
  if (afterIndex >= messages.length - 1) {
    return;
  }
  const protectTokens =
    reason === 'manual' ? 0 : Math.floor(contextLength * spec.protectRecentRatio);
  const plan = planCut(messages, { protectTokens, afterIndex });
  if (!plan) {
    return;
  }
  yield* writeCompactionMessage(ctx, {
    spec,
    reason,
    plan,
    anchorIndex,
    anchor,
    toolsJson,
    before,
  });
}

type WriteArgs = {
  spec: ParsedCompactionSpec;
  reason: 'threshold' | 'manual';
  plan: { coveredFrom: number; coveredUntil: number };
  anchorIndex: number;
  anchor?: CompactionMessage;
  toolsJson: string;
  before: { messages: number; tools: number; total: number };
};

async function* writeCompactionMessage(
  ctx: CompactionPassContext,
  args: WriteArgs,
): AsyncGenerator<CompactionPassEvent> {
  const messages = ctx.state.messages as unknown[];
  let binding = ctx.binding;
  if (args.spec.summaryModel) {
    try {
      binding = await resolveSummaryBinding(ctx, args.spec.summaryModel);
    } catch (e) {
      yield { type: 'failed', error: e instanceof Error ? e.message : String(e) };
      return;
    }
  }
  const from = args.anchor ? args.anchor.coveredUntil + 1 : 0;
  const head: unknown[] = [];
  for (let i = from; i <= args.plan.coveredUntil; i++) {
    if (i === args.anchorIndex) {
      continue;
    }
    head.push(messages[i]);
  }
  if (head.length === 0) {
    return;
  }
  const system = args.anchor
    ? `${SUMMARY_SYSTEM_PROMPT}${priorSummaryBlock(args.anchor.content)}`
    : SUMMARY_SYSTEM_PROMPT;

  let completed: Extract<StreamChunk, { type: 'completed' }> | undefined;
  for await (const ev of streamSummary({ binding, system, head, signal: ctx.signal })) {
    if (ev.type === 'summary.completed' && ev.result) {
      completed = ev.result as Extract<StreamChunk, { type: 'completed' }>;
    } else {
      yield { type: ev.type, data: ev.data } as CompactionPassEvent;
    }
  }
  const text = completed && typeof completed.text === 'string' ? completed.text : '';
  if (completed?.finishReason !== 'stop' || !text.trim()) {
    yield {
      type: 'failed',
      error: `summary pass rejected: finishReason=${completed?.finishReason ?? 'none'}${
        text.trim() ? '' : ', empty text'
      }`,
    };
    return;
  }

  const message: CompactionMessage = {
    role: 'assistant',
    kind: 'compaction',
    id: crypto.randomUUID(),
    content: text,
    coveredFrom: args.plan.coveredFrom,
    coveredUntil: args.plan.coveredUntil,
    reason: args.reason,
    stats: {
      tokensBefore: args.before.total,
      tokensAfter: 0,
      coveredCount: args.plan.coveredUntil - args.plan.coveredFrom + 1,
      usage: completed.usage,
    },
    model: { provider: binding.driver, model: binding.name },
    createdAt: new Date().toISOString(),
  };
  message.stats.tokensAfter = estimateTokens(
    projectCompacted([...messages, message]),
    args.toolsJson,
  ).total;
  messages.push(message);

  try {
    await writeCompactionFile({
      paths: ctx.paths,
      sessionId: ctx.sessionId,
      message,
      modelLabel: binding.name,
    });
  } catch (e) {
    // biome-ignore lint/suspicious/noConsole: file log is best-effort; failure must not fail the run
    console.warn(`[compaction] file log failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  yield { type: 'completed', message };
}

/** Авто-путь графа: порог, protect-recent, одна попытка обеспечивается вызывающим. */
export async function* runSummaryPassIfDue(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (!ref) {
    return;
  }
  if (ref.name !== THRESHOLD_SUMMARY_NAME) {
    // biome-ignore lint/suspicious/noConsole: no logger in library; diagnostics must reach run logs
    console.warn(`[compaction] unknown compaction port: ${ref.name}`);
    return;
  }
  const spec = parseThresholdSpec(ref.spec);
  if (!spec.auto) {
    return;
  }
  yield* passIfDue(ctx, spec, 'threshold');
}

/** Ручной /compact: без порога и protect-recent; компакция обязана быть настроена. */
export async function* compactForced(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (!ref || ref.name !== THRESHOLD_SUMMARY_NAME) {
    throw Object.assign(new Error('compaction is not configured'), {
      code: 'compaction_not_configured',
    });
  }
  yield* passIfDue(ctx, parseThresholdSpec(ref.spec), 'manual');
}
