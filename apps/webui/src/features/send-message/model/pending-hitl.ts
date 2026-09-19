import type { SessionEvent } from '@harnesys/studio-shared';

export type PendingHitl = {
  askId: string;
  schema: unknown;
  source: string;
  prompt?: string;
  tool?: { name: string; input: unknown; toolCallId: string };
};

/** Terminal events close the card; run.started does not. */
const CLOSING_EVENT_TYPES = new Set([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

export function pendingHitl(events: SessionEvent[]): PendingHitl | null {
  // Twin of extractSpawns / extractMaps pass-1: features cannot import from
  // widgets (FSD flows downward only), so the id sets are duplicated here.
  const childRunIds = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'agent.spawned') {
      childRunIds.add(ev.spawnId);
    } else if (ev.type === 'map.item.started') {
      childRunIds.add(ev.workerId);
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev) {
      continue;
    }
    if (CLOSING_EVENT_TYPES.has(ev.type)) {
      return null;
    }
    if (ev.type === 'hitl.answer') {
      return null;
    }
    if (ev.type === 'ask') {
      // Spawn/map-worker asks are dead by construction (sandboxed children
      // never park; old journals may still carry them): skip and keep scanning
      // for a root ask instead of returning a dead card.
      if (ev.runId !== undefined && childRunIds.has(ev.runId)) {
        continue;
      }
      return ev;
    }
  }
  return null;
}
