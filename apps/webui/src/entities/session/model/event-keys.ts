import type { SessionEvent } from '@harnesys/studio-shared';
import { streamDeltaKey } from './coalesce-events.ts';

let timestampCounter = 0;
export function stableEventKey(ev: SessionEvent): string | undefined {
  if ('clientEventId' in ev && ev.clientEventId) {
    return `ce:${ev.clientEventId}`;
  }
  if (ev.runId !== undefined && ev.seq !== undefined) {
    return streamDeltaKey(ev, ev.seq) ?? `${ev.runId}:${ev.seq}`;
  }
  return undefined;
}
export function eventKey(ev: SessionEvent): string {
  return stableEventKey(ev) ?? `t:${timestampCounter++}`;
}
export function stableKeys(events: SessionEvent[]): string[] {
  const keys: string[] = [];
  for (const ev of events) {
    const key = stableEventKey(ev);
    if (key !== undefined) {
      keys.push(key);
    }
  }
  return keys;
}
export function fillSeenAt(
  prev: Record<string, Record<string, number>>,
  threadId: string,
  keys: string[],
  now: number,
): Record<string, Record<string, number>> {
  const threadSeen = prev[threadId];
  let next: Record<string, number> | undefined;
  for (const key of keys) {
    if (threadSeen?.[key] === undefined && next?.[key] === undefined) {
      next = { ...threadSeen, ...next, [key]: now };
    }
  }
  if (next === undefined) {
    return prev;
  }
  return { ...prev, [threadId]: next };
}
export function ceilFromEvents(events: SessionEvent[]): Record<string, number> {
  const ceil: Record<string, number> = {};
  for (const ev of events) {
    if (ev.runId !== undefined && ev.seq !== undefined) {
      ceil[ev.runId] = Math.max(ceil[ev.runId] ?? 0, ev.seq);
    }
  }
  return ceil;
}
export function bumpCeil(
  seqCeil: Record<string, Record<string, number>>,
  threadId: string,
  event: SessionEvent,
): Record<string, Record<string, number>> {
  const { runId, seq } = event;
  if (runId === undefined || seq === undefined) {
    return seqCeil;
  }
  const thread = seqCeil[threadId] ?? {};
  if (seq <= (thread[runId] ?? 0)) {
    return seqCeil;
  }
  return { ...seqCeil, [threadId]: { ...thread, [runId]: seq } };
}
