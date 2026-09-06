import { AskUserInterrupt } from '../domain/errors.ts';
import type { Snapshot } from '../domain/snapshot.ts';
import type { PendingSessionEvent, RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore, RunTransitionPatch } from '../ports/run-lifecycle-store.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SessionEvent } from '../ports/session.ts';
import type { GraphOpts } from './graph.ts';
import { startGraph } from './graph.ts';
import {
  eventToSessionEvent,
  runCancelledEvent,
  runCompletedEvent,
  runFailedEvent,
} from './run-engine-events.ts';
import type { RunEventFeed } from './run-event-feed.ts';

export type SegmentEnv = {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  isLeaseLost: () => boolean;
};

/** Событий в батче журнала: запись группируется, публикация в feed — нет. */
const JOURNAL_BATCH = 16;

export type SegmentCtx = {
  runId: string;
  epoch: number;
  pending: SessionEvent[];
};

type SegmentTail = {
  doneText?: string;
  failMessage?: string;
  cancelReason?: string;
};

function isToolTerminal(event: SessionEvent): boolean {
  return (
    event.type === 'tool' &&
    (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'skipped')
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'run failed';
}

function lastText(snap: Snapshot | null): string | undefined {
  const state = snap?.state as Record<string, unknown> | undefined;
  const msgs = state?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return undefined;
  }
  const last = msgs[msgs.length - 1] as Record<string, unknown> | undefined;
  const content = last?.content;
  return typeof content === 'string' && content ? content : undefined;
}

/**
 * Group-commit журнал: seq выдаёт стор и событие сразу уходит подписчикам,
 * запись в стор группируется в батчи. Между publish и append событие живёт
 * только в ctx.pending; сброс буфера при lease_stale оставляет пробел в seq.
 */
export function admit(env: SegmentEnv, runId: string, event: PendingSessionEvent): SessionEvent {
  const seq = env.events.next(runId);
  const full = { ...event, seq, runId } as SessionEvent;
  env.feed.publish(runId, [full]);
  return full;
}

/** Пишет батч в журнал; false = lease потерян, буфер сброшен. */
export async function flushJournal(env: SegmentEnv, ctx: SegmentCtx): Promise<boolean> {
  if (ctx.pending.length === 0) {
    return true;
  }
  try {
    await env.events.append(ctx.runId, ctx.epoch, ctx.pending);
    ctx.pending.length = 0;
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'lease_stale') {
      ctx.pending.length = 0;
      return false;
    }
    throw err;
  }
}

/**
 * Transition-embedded events are journaled by the store and published here
 * so live subscribers receive ask/terminal frames at-least-once.
 */
export async function guardedTransition(
  env: SegmentEnv,
  runId: string,
  expectedEpoch: number,
  patch: RunTransitionPatch,
): Promise<void> {
  const before = await env.lifecycle.get(runId);
  try {
    await env.lifecycle.transition(runId, expectedEpoch, patch);
  } catch (err) {
    if ((err as { code?: string }).code === 'lease_stale') {
      return;
    }
    throw err;
  }
  if (env.isLeaseLost()) {
    return;
  }
  const stored = await env.events.tail(runId, before?.lastSeq ?? 0);
  if (stored.length > 0) {
    env.feed.publish(runId, stored);
  }
}

async function pauseOnAsk(
  env: SegmentEnv,
  ctx: SegmentCtx,
  ask: PendingSessionEvent,
  askId: string,
): Promise<void> {
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'needs_input',
    interruptId: askId,
    events: [ask],
  });
}

async function pauseFromSnapshot(
  env: SegmentEnv,
  ctx: SegmentCtx,
  snap: Snapshot | null,
): Promise<void> {
  const interrupt = snap?.cursor.interrupt;
  if (interrupt === undefined) {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'failed',
      events: [runFailedEvent('segment paused without interrupt cursor')],
    });
    return;
  }
  const ask = {
    type: 'ask',
    askId: interrupt.interruptId,
    schema: interrupt.resumeSchema,
    source: 'interrupt',
    prompt: interrupt.reason,
  } as PendingSessionEvent;
  await pauseOnAsk(env, ctx, ask, interrupt.interruptId);
}

async function pauseOnInterrupt(
  env: SegmentEnv,
  ctx: SegmentCtx,
  err: AskUserInterrupt,
  state: RuntimeState,
): Promise<void> {
  const snap = await state.load();
  const interruptId = err.interruptId ?? snap?.cursor.interrupt?.interruptId ?? crypto.randomUUID();
  const ask = {
    type: 'ask',
    askId: interruptId,
    schema: err.resumeSchema ?? {},
    source: err.source ?? 'ask_user',
    prompt: err.prompt,
    tool: err.tool,
  } as PendingSessionEvent;
  await pauseOnAsk(env, ctx, ask, interruptId);
}

async function settleTerminal(
  env: SegmentEnv,
  ctx: SegmentCtx,
  tail: SegmentTail,
  snap: Snapshot | null,
): Promise<void> {
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  const status = snap?.status ?? 'completed';
  if (status === 'needs_input') {
    await pauseFromSnapshot(env, ctx, snap);
    return;
  }
  if (status === 'completed') {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'completed',
      events: [runCompletedEvent(tail.doneText ?? lastText(snap))],
    });
    return;
  }
  if (status === 'cancelled' || tail.cancelReason !== undefined) {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'cancelled',
      events: [runCancelledEvent(tail.cancelReason ?? 'run cancelled')],
    });
    return;
  }
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'failed',
    events: [runFailedEvent(tail.failMessage ?? `run failed: ${status}`)],
  });
}

async function failSegment(
  env: SegmentEnv,
  ctx: SegmentCtx,
  graphOpts: GraphOpts,
  err: unknown,
): Promise<void> {
  if (env.isLeaseLost() || (err as { code?: string }).code === 'lease_stale') {
    return;
  }
  if (err instanceof AskUserInterrupt) {
    await pauseOnInterrupt(env, ctx, err, graphOpts.state);
    return;
  }
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  if (graphOpts.signal?.aborted) {
    const reason = graphOpts.signal.reason;
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'cancelled',
      events: [runCancelledEvent(typeof reason === 'string' && reason ? reason : 'run cancelled')],
    });
    return;
  }
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'failed',
    events: [runFailedEvent(messageOf(err))],
  });
}

export async function runSegment(
  env: SegmentEnv,
  runId: string,
  epoch: number,
  graphOpts: GraphOpts,
): Promise<void> {
  const ctx: SegmentCtx = { runId, epoch, pending: [] };
  const tail: SegmentTail = {};
  let ask: { event: PendingSessionEvent; askId: string } | null = null;
  try {
    for await (const event of startGraph(graphOpts)) {
      const mapped = eventToSessionEvent(event);
      if (mapped === null) {
        continue;
      }
      if (mapped.type === 'ask') {
        ask = { event: mapped, askId: mapped.askId };
        break;
      }
      if (mapped.type === 'done') {
        tail.doneText = mapped.text;
        continue;
      }
      if (mapped.type === 'error') {
        if (mapped.code === 'cancelled') {
          tail.cancelReason = mapped.message;
        } else {
          tail.failMessage = mapped.message;
        }
        continue;
      }
      ctx.pending.push(admit(env, runId, mapped));
      if (ctx.pending.length >= JOURNAL_BATCH || isToolTerminal(mapped)) {
        if (!(await flushJournal(env, ctx))) {
          return;
        }
      }
    }
  } catch (err) {
    await failSegment(env, ctx, graphOpts, err);
    return;
  }
  if (ask !== null) {
    await pauseOnAsk(env, ctx, ask.event, ask.askId);
    return;
  }
  await settleTerminal(env, ctx, tail, await graphOpts.state.load());
}
