import type { Cursor, Event, Snapshot } from '../domain/snapshot.ts';
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
};

export function mkSnap(ctx: SnapCtx, status: string): Snapshot {
  return {
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    definitionHash: hashStr(ctx.agentJson),
    planHash: hashStr(ctx.orderJson),
    sequence: ctx.seq,
    status,
    runtimeVersion: '0.2.0',
    initialInput: ctx.input,
    state: ctx.state,
    cursor: {
      nodes: {
        [ctx.cur]: { phase: 'executing', nodeExecutionId: `${ctx.runId}:${ctx.cur}:${ctx.steps}` },
      },
      budget: { steps: ctx.steps, tokens: ctx.tokens },
    } as unknown as Cursor,
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
