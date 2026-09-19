import type { SessionEvent } from '@harnesys/studio-shared';
export type PendingHitl = {
  askId: string;
  schema: unknown;
  source: string;
  prompt?: string;
  tool?: {
    name: string;
    input: unknown;
    toolCallId: string;
  };
};
const CLOSING_EVENT_TYPES = new Set([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);
export function pendingHitl(events: SessionEvent[]): PendingHitl | null {
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
      if (ev.runId !== undefined && childRunIds.has(ev.runId)) {
        continue;
      }
      return ev;
    }
  }
  return null;
}
