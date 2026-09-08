import type { Attachment } from '../domain/attachment.ts';
import type { Event } from '../domain/snapshot.ts';
import type { PendingSessionEvent } from '../ports/run-event-store.ts';
import type { ModelUsage, SessionEvent } from '../ports/session.ts';

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeModelUsage(raw: unknown, meta?: Record<string, unknown>): ModelUsage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const u = raw as Record<string, unknown>;
  const inputDetails = u.inputTokenDetails as Record<string, unknown> | undefined;
  const outputDetails = u.outputTokenDetails as Record<string, unknown> | undefined;
  const detailSum =
    (num(inputDetails?.noCacheTokens) ?? 0) +
    (num(inputDetails?.cacheReadTokens) ?? 0) +
    (num(inputDetails?.cacheWriteTokens) ?? 0);
  const promptTokens =
    num(u.inputTokens) ??
    num(u.input) ??
    num(u.promptTokens) ??
    num(u.prompt_tokens) ??
    (detailSum > 0 ? detailSum : undefined);
  const generatedTokens =
    num(u.outputTokens) ?? num(u.output) ?? num(u.generatedTokens) ?? num(u.completion_tokens);
  if (promptTokens === undefined && generatedTokens === undefined) {
    return null;
  }
  const model = typeof meta?.model === 'string' && meta.model ? meta.model : '';
  const usage: ModelUsage = {
    model,
    promptTokens: promptTokens ?? 0,
    generatedTokens: generatedTokens ?? 0,
  };
  const total = num(u.totalTokens) ?? num(u.total_tokens);
  if (total !== undefined) {
    usage.totalTokens = total;
  }
  const reasoning =
    num(outputDetails?.reasoningTokens) ?? num(u.reasoningTokens) ?? num(u.reasoning);
  if (reasoning !== undefined) {
    usage.reasoningTokens = reasoning;
  }
  const cacheRead =
    num(inputDetails?.cacheReadTokens) ?? num(u.cacheRead) ?? num(u.cachedInputTokens);
  if (cacheRead !== undefined) {
    usage.cacheReadTokens = cacheRead;
  }
  const cacheWrite = num(inputDetails?.cacheWriteTokens) ?? num(u.cacheWrite);
  if (cacheWrite !== undefined) {
    usage.cacheWriteTokens = cacheWrite;
  }
  const durationMs = num(meta?.durationMs) ?? num(meta?.ms);
  if (durationMs !== undefined) {
    usage.durationMs = durationMs;
  }
  return usage;
}

export function eventToSessionEvent(ev: Event): SessionEvent | null {
  const t = ev.type;
  if (t === 'user.message') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const raw = m?.text as string | undefined;
    const atts = m?.attachments as Attachment[] | undefined;
    const origin = typeof m?.origin === 'string' ? m.origin : undefined;
    const text = typeof raw === 'string' ? raw : '';
    if (!text && (!atts || atts.length === 0)) {
      return null;
    }
    return {
      type: 'user',
      text,
      attachments: Array.isArray(atts) && atts.length > 0 ? atts : undefined,
      origin,
      clientEventId: typeof m?.clientEventId === 'string' ? m.clientEventId : undefined,
    };
  }
  if (t === 'model.delta') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const raw = m?.text;
    const id = typeof m?.id === 'string' ? m.id : undefined;
    if (typeof raw === 'string' && raw) {
      return { type: 'text-delta', text: raw, id };
    }
    return null;
  }
  if (t === 'model.reasoning') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const raw = m?.text ?? m?.delta;
    const id = typeof m?.id === 'string' ? m.id : undefined;
    if (typeof raw === 'string' && raw) {
      return { type: 'reasoning-delta', text: raw, id };
    }
    return null;
  }
  if (t === 'model.reasoning-start') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'reasoning-start', id: String(m?.id ?? '') };
  }
  if (t === 'model.reasoning-end') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'reasoning-end', id: String(m?.id ?? '') };
  }
  if (t === 'model.tool-input-start') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.toolName ?? m?.name ?? ''),
      delta: '',
    };
  }
  if (t === 'model.tool-input-delta') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const delta = typeof m?.delta === 'string' ? m.delta : '';
    if (!delta) {
      return null;
    }
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.toolName ?? m?.name ?? ''),
      delta,
    };
  }
  if (t === 'model.tool-input-end') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.toolName ?? m?.name ?? ''),
      delta: '',
    };
  }
  if (t === 'model.tool-call') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'requested',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.name ?? m?.toolName ?? ''),
      input: m?.args ?? m?.input,
    };
  }
  if (t === 'model.source') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'source', source: m?.source ?? m };
  }
  if (t === 'model.file') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'file', file: m?.file ?? m };
  }
  if (t === 'model.completed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const usage = normalizeModelUsage(m?.usage, m);
    if (!usage) {
      return null;
    }
    return { type: 'model.usage', usage };
  }
  if (t === 'model.stats') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const errs = Array.isArray(m?.notesErrors) ? m.notesErrors : [];
    return {
      type: 'model.stats',
      tools: num(m?.tools) ?? 0,
      deferredPending: num(m?.deferredPending) ?? 0,
      systemChars: num(m?.systemChars) ?? 0,
      notesChars: num(m?.notesChars) ?? 0,
      notesErrors: errs.filter((x): x is string => typeof x === 'string'),
    };
  }
  if (t === 'compaction.completed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const id = typeof m?.id === 'string' ? m.id : '';
    if (!id) {
      return null;
    }
    const reason = m?.reason === 'manual' ? 'manual' : 'threshold';
    return {
      type: 'compaction',
      id,
      reason,
      coveredFrom: num(m?.coveredFrom) ?? 0,
      coveredUntil: num(m?.coveredUntil) ?? 0,
      tokensBefore: num(m?.tokensBefore) ?? 0,
      tokensAfter: num(m?.tokensAfter) ?? 0,
    };
  }
  if (t === 'tool.completed' || t === 'tool.intent') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: t === 'tool.intent' ? 'requested' : 'completed',
      toolCallId: String(m?.toolCallId ?? ''),
      name: String(m?.name ?? ''),
      input: m?.input,
      output: m?.output,
    };
  }
  if (t === 'tool.failed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'failed',
      toolCallId: String(m?.toolCallId ?? ''),
      name: String(m?.name ?? ''),
      input: m?.input,
      output: m?.output,
    };
  }
  if (t === 'tool.skipped') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'skipped',
      toolCallId: String(m?.toolCallId ?? ''),
      name: String(m?.name ?? ''),
      input: m?.input,
      output: m?.output,
    };
  }
  if (t === 'interrupt.triggered') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const baseSchema = (m?.resumeSchema as Record<string, unknown>) ?? {};
    const schema: Record<string, unknown> = { ...baseSchema };
    if (m?.options) {
      schema.options = m.options;
    }
    if (m?.multi !== undefined) {
      schema.multi = m.multi;
    }
    return {
      type: 'ask',
      askId: String(m?.interruptId ?? ''),
      schema,
      source:
        (m?.source as
          | 'permission'
          | 'approve'
          | 'middleware'
          | 'interrupt'
          | 'ask_user'
          | 'budget') ?? 'interrupt',
      prompt: typeof m?.reason === 'string' ? m.reason : undefined,
      tool: m?.tool as { name: string; input: unknown; toolCallId: string } | undefined,
    };
  }
  if (t === 'run.completed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'done',
      text: typeof m?.text === 'string' ? m.text : undefined,
    };
  }
  if (t === 'run.failed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'error',
      code: String(m?.code ?? 'run_failed'),
      message: String(m?.message ?? 'run failed'),
    };
  }
  if (t === 'run.cancelled') {
    return { type: 'error', code: 'cancelled', message: 'run cancelled' };
  }
  if (t === 'run.started') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const attempt = typeof m?.attempt === 'number' ? m.attempt : 0;
    return { type: 'run.started', attempt };
  }
  if (t === 'hitl.answer') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'hitl.answer',
      interruptId: String(m?.interruptId ?? ''),
      payload: m?.payload,
      rejected: m?.rejected === true ? true : undefined,
      note: typeof m?.note === 'string' ? m.note : undefined,
      clientEventId: typeof m?.clientEventId === 'string' ? m.clientEventId : undefined,
    };
  }
  if (t === 'agent.handoff') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const fromMeta = typeof m?.agentId === 'string' ? m.agentId : '';
    const agentId = fromMeta || ev.agentId;
    if (!agentId) {
      return null;
    }
    return { type: 'agent.handoff', agentId };
  }
  if (t === 'agent.spawned' || t === 'agent.completed' || t === 'agent.failed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const agentId = typeof m?.agentId === 'string' ? m.agentId : ev.agentId;
    const spawnId = typeof m?.spawnId === 'string' ? m.spawnId : '';
    if (!spawnId) {
      return null;
    }
    if (t === 'agent.failed') {
      return {
        type: 'agent.failed',
        agentId,
        spawnId,
        code: typeof m?.code === 'string' ? m.code : undefined,
        message: typeof m?.message === 'string' ? m.message : undefined,
      };
    }
    if (t === 'agent.spawned') {
      return {
        type: 'agent.spawned',
        agentId,
        spawnId,
        ...(m?.taskInput !== undefined ? { taskInput: m.taskInput } : {}),
      };
    }
    return { type: t, agentId, spawnId };
  }
  return null;
}

export function runStartedEvent(attempt: number): PendingSessionEvent {
  return { type: 'run.started', attempt } as PendingSessionEvent;
}

export function runCompletedEvent(text?: string): PendingSessionEvent {
  return { type: 'run.completed', text } as PendingSessionEvent;
}

export function runCancelledEvent(reason: string): PendingSessionEvent {
  return { type: 'run.cancelled', reason } as PendingSessionEvent;
}

export function runFailedEvent(message: string): PendingSessionEvent {
  return { type: 'run.failed', message } as PendingSessionEvent;
}

export function agentHandoffEvent(agentId: string): PendingSessionEvent {
  return { type: 'agent.handoff', agentId } as PendingSessionEvent;
}
