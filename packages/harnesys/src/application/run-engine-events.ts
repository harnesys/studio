import type { Attachment } from '../domain/attachment.ts';
import type { Event } from '../domain/snapshot.ts';
import type { PendingSessionEvent } from '../ports/run-event-store.ts';
import type { SessionEvent } from '../ports/session.ts';

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
    return null;
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
        (m?.source as 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user') ??
        'interrupt',
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
