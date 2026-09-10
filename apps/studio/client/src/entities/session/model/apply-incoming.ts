import type { SessionEvent } from '@studio/shared';

import { isToolInputStream, mergeDeltaContinuation, mergeIncomingEvent } from './coalesce-events';
import { eventKey, stableEventKey } from './event-keys';

export type ThreadLog = {
  events: SessionEvent[];
  seenAt: Record<string, number>;
  seqCeil: Record<string, number>;
};

export type ApplyIncomingResult = ThreadLog & {
  accepted: number;
  /** true, если принят кадр, который не продолжает хвостовую дельту. */
  immediateEpoch: boolean;
};

function isCoalescedStream(event: SessionEvent): boolean {
  return (
    event.type === 'text-delta' || event.type === 'reasoning-delta' || isToolInputStream(event)
  );
}

/**
 * Применяет пачку кадров к логу треда. Дельты мутируют рабочую копию
 * (без O(n) копий на токен); continuation не плодит seenAt-ключи.
 */
export function applyIncomingEvents(
  current: ThreadLog,
  incoming: SessionEvent[],
  now: number,
): ApplyIncomingResult {
  let events = current.events;
  let eventsCopy: SessionEvent[] | undefined;
  let seqCeil = current.seqCeil;
  let seqCopy: Record<string, number> | undefined;
  let seenAt = current.seenAt;
  let seenCopy: Record<string, number> | undefined;
  let accepted = 0;
  let immediateEpoch = false;

  const workingEvents = (): SessionEvent[] => {
    if (eventsCopy === undefined) {
      eventsCopy = current.events.slice();
      events = eventsCopy;
    }
    return eventsCopy;
  };

  for (const event of incoming) {
    if (
      event.runId !== undefined &&
      event.seq !== undefined &&
      event.seq <= (seqCeil[event.runId] ?? 0)
    ) {
      continue;
    }
    if (event.runId !== undefined && event.seq !== undefined) {
      if (seqCopy === undefined) {
        seqCopy = { ...current.seqCeil };
        seqCeil = seqCopy;
      }
      seqCeil[event.runId] = event.seq;
    }
    accepted += 1;

    if (isCoalescedStream(event)) {
      const list = workingEvents();
      const tail = list[list.length - 1];
      if (tail !== undefined) {
        const merged = mergeDeltaContinuation(tail, event);
        if (merged !== null) {
          list[list.length - 1] = merged;
          continue;
        }
      }
      list.push(event);
      immediateEpoch = true;
      rememberSeen(event, now, () => {
        if (seenCopy === undefined) {
          seenCopy = { ...current.seenAt };
          seenAt = seenCopy;
        }
        return seenCopy;
      });
      continue;
    }

    const list = workingEvents();
    const key = eventKey(event);
    const index = list.findIndex((ev) => eventKey(ev) === key);
    if (index === -1) {
      list.push(event);
    } else {
      list[index] = mergeIncomingEvent(list[index], event);
    }
    immediateEpoch = true;
    rememberSeen(event, now, () => {
      if (seenCopy === undefined) {
        seenCopy = { ...current.seenAt };
        seenAt = seenCopy;
      }
      return seenCopy;
    });
  }

  return { events, seenAt, seqCeil, accepted, immediateEpoch };
}

function rememberSeen(event: SessionEvent, now: number, copy: () => Record<string, number>): void {
  const key = stableEventKey(event);
  if (key === undefined) {
    return;
  }
  const seen = copy();
  if (seen[key] === undefined) {
    seen[key] = now;
  }
}
