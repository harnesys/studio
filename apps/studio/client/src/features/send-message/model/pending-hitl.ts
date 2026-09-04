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
      return ev;
    }
  }
  return null;
}
