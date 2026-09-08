import type { SessionEvent } from '@studio/shared';

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
  // Twin of the extractSpawns pass-1 (widgets/chat-transcript/model/spawn-groups.ts):
  // features cannot import from widgets (FSD flows downward only), so the
  // 5-line set collection is duplicated here.
  const spawnIds = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'agent.spawned') {
      spawnIds.add(ev.spawnId);
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
      // Spawn-run asks are dead by construction (sandboxed one-shot children
      // never park; old journals may still carry them): skip and keep scanning
      // for a root ask instead of returning a dead card.
      if (ev.runId !== undefined && spawnIds.has(ev.runId)) {
        continue;
      }
      return ev;
    }
  }
  return null;
}
