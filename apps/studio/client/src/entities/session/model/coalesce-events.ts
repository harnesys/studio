import type { SessionEvent } from '@studio/shared';

type StreamDelta = SessionEvent & {
  type: 'text-delta' | 'reasoning-delta';
  text: string;
};

function isStreamDelta(event: SessionEvent): event is StreamDelta {
  return event.type === 'text-delta' || event.type === 'reasoning-delta';
}

/** Stable slot for a streaming text/reasoning block (ignores per-token seq). */
export function streamDeltaKey(event: SessionEvent): string | null {
  if (!isStreamDelta(event) || !event.runId || !event.id) {
    return null;
  }
  return `${event.type}:${event.runId}:${event.id}`;
}

function mergeDelta(existing: StreamDelta, incoming: StreamDelta): StreamDelta {
  return {
    ...incoming,
    text: existing.text + incoming.text,
  };
}

/**
 * Склеивает подряд идущие text/reasoning-delta с одним id в один слот.
 * Сырой лог с сервера хранит токены по одному событию — в клиентском сторе
 * это превращается в тысячи ререндеров на ран.
 */
export function coalesceStreamDeltas(events: SessionEvent[]): SessionEvent[] {
  if (events.length < 2) {
    return events;
  }
  const out: SessionEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (
      last &&
      isStreamDelta(last) &&
      isStreamDelta(event) &&
      last.type === event.type &&
      last.id !== undefined &&
      last.id === event.id &&
      last.runId !== undefined &&
      last.runId === event.runId
    ) {
      out[out.length - 1] = mergeDelta(last, event);
      continue;
    }
    out.push(event);
  }
  return out;
}

/** Merge an incoming delta into an existing same-slot event, or return incoming. */
export function mergeIncomingEvent(
  existing: SessionEvent | undefined,
  incoming: SessionEvent,
): SessionEvent {
  if (
    existing &&
    isStreamDelta(existing) &&
    isStreamDelta(incoming) &&
    existing.type === incoming.type &&
    existing.id !== undefined &&
    existing.id === incoming.id &&
    existing.runId !== undefined &&
    existing.runId === incoming.runId
  ) {
    return mergeDelta(existing, incoming);
  }
  return incoming;
}
