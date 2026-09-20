import type { SessionEvent, SessionEventType } from '@harnesys/studio-shared';
import { applyIncomingEvents } from './apply-incoming';
import { feedUpdate } from './feed/feed-engine';
import type { FeedDecision } from './feed/feed-types';
import type { SessionStoreState } from './session.store';

export const EMPTY_EVENTS: SessionEvent[] = [];
export function isStreamDeltaType(type: SessionEventType): boolean {
  return type === 'text-delta' || type === 'reasoning-delta';
}
function bumpEpoch(state: SessionStoreState, threadId: string): Record<string, number> {
  return { ...state.contentEpoch, [threadId]: Date.now() };
}
export function applyBatches(
  state: SessionStoreState,
  batches: Map<string, SessionEvent[]>,
): SessionStoreState {
  if (batches.size === 0) {
    return state;
  }
  const now = Date.now();
  let next = state;
  for (const [threadId, incoming] of batches) {
    const sink: FeedDecision[] = [];
    const result = applyIncomingEvents(
      {
        events: next.events[threadId] ?? EMPTY_EVENTS,
        seenAt: next.seenAt[threadId] ?? {},
        seqCeil: next.seqCeil[threadId] ?? {},
      },
      incoming,
      now,
      sink,
    );
    if (result.accepted === 0) {
      continue;
    }
    next = {
      ...next,
      events: { ...next.events, [threadId]: result.events },
      feeds: {
        ...next.feeds,
        [threadId]: feedUpdate(threadId, result.events, result.seenAt, sink),
      },
      seenAt: { ...next.seenAt, [threadId]: result.seenAt },
      seqCeil: { ...next.seqCeil, [threadId]: result.seqCeil },
      contentEpoch: bumpEpoch(next, threadId),
    };
  }
  return next;
}
