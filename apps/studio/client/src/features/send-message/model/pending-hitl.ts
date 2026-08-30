import type { SessionEvent } from '@studio/shared';

export type PendingHitl = {
  askId: string;
  schema: unknown;
  source: string;
  prompt?: string;
  tool?: { name: string; input: unknown; toolCallId: string };
};

export function pendingHitl(events: SessionEvent[]): PendingHitl | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'done' || ev.type === 'error') {
      return null;
    }
    if (ev.type === 'ask') {
      return ev;
    }
  }
  return null;
}
