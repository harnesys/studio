import type { Cursor, Event, Snapshot } from '../domain/snapshot.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import { hashStr } from './graph-helpers.ts';

export type SnapCtx = {
  sessionId: string;
  runId: string;
  seq: number;
  agentJson: string;
  orderJson: string;
  input: unknown;
  state: Record<string, unknown>;
  cur: string;
  steps: number;
  tokens: number;
  startedAt: number;
  nodeStep: number;
};

export function mkSnap(ctx: SnapCtx, status: string): Snapshot {
  return {
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    definitionHash: hashStr(ctx.agentJson),
    planHash: hashStr(ctx.orderJson),
    sequence: ctx.seq,
    status,
    runtimeVersion: '0.3.0',
    initialInput: ctx.input,
    state: ctx.state,
    cursor: {
      nodes: {
        [ctx.cur]: {
          phase: 'executing',
          nodeExecutionId: `${ctx.runId}:${ctx.cur}:${ctx.nodeStep}`,
        },
      },
      budget: { steps: ctx.steps, tokens: ctx.tokens, startedAt: ctx.startedAt },
    } as Cursor,
    artifacts: null,
  };
}

export function mkEv(ctx: SnapCtx, type: string): Event {
  return {
    eventId: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    agentId: '',
    sequence: ctx.seq,
    metadata: {},
  };
}

function pairDanglingToolCalls(state: Record<string, unknown>): Record<string, unknown> {
  const prev = state.messages;
  if (!Array.isArray(prev) || prev.length === 0) {
    return state;
  }
  const last = prev[prev.length - 1];
  if (!last || typeof last !== 'object' || Array.isArray(last)) {
    return state;
  }
  const rec = last as Record<string, unknown>;
  if (rec.role !== 'assistant' || !Array.isArray(rec.toolCalls) || rec.toolCalls.length === 0) {
    return state;
  }
  const messages = [...prev];
  for (const raw of rec.toolCalls) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const call = raw as Record<string, unknown>;
    const toolCallId = typeof call.id === 'string' ? call.id : '';
    const name = typeof call.name === 'string' ? call.name : 'tool';
    if (!toolCallId) {
      continue;
    }
    messages.push({
      role: 'tool',
      toolCallId,
      name,
      content: '{"ok":true,"note":"closed before the next run"}',
    });
  }
  return { ...state, messages };
}

/** A completed lifecycle run can leave the thread snapshot on needs_input. A later send then resumes `act` with empty `$output`. */
export async function abandonForeignSnapshot(state: RuntimeState, runId: string): Promise<void> {
  const snap = await state.load();
  if (!snap || snap.runId === runId) {
    return;
  }
  if (snap.status !== 'needs_input' && snap.status !== 'running') {
    return;
  }
  const sequence = snap.sequence + 1;
  const cursor = { ...snap.cursor };
  delete cursor.interrupt;
  await state.commit(
    {
      ...snap,
      status: 'completed',
      sequence,
      state: pairDanglingToolCalls(snap.state),
      cursor,
    },
    [],
    { kind: 'recorded', sequence },
  );
}
