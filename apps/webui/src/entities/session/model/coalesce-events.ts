import type { SessionEvent } from '@harnesys/studio-shared';

type StreamDelta = SessionEvent & {
  type: 'text-delta' | 'reasoning-delta';
  text: string;
};
type ToolInputStream = SessionEvent & {
  type: 'tool';
  phase: 'streaming';
};
function isStreamDelta(event: SessionEvent): event is StreamDelta {
  return event.type === 'text-delta' || event.type === 'reasoning-delta';
}
export function isToolInputStream(event: SessionEvent): event is ToolInputStream {
  return event.type === 'tool' && event.phase === 'streaming';
}
export function streamDeltaKey(event: SessionEvent, slotSeq: number): string | null {
  if (!isStreamDelta(event) || !event.runId || event.id === undefined) {
    return null;
  }
  return `${event.type}:${event.runId}:${event.id}:${slotSeq}`;
}
export function continuesDelta(existing: SessionEvent, incoming: SessionEvent): boolean {
  return (
    isStreamDelta(existing) &&
    isStreamDelta(incoming) &&
    existing.type === incoming.type &&
    existing.id !== undefined &&
    existing.id === incoming.id &&
    existing.runId !== undefined &&
    existing.runId === incoming.runId
  );
}
export function mergeDeltaContinuation(
  existing: SessionEvent,
  incoming: SessionEvent,
): SessionEvent | null {
  if (isStreamDelta(existing) && isStreamDelta(incoming) && continuesDelta(existing, incoming)) {
    return mergeDelta(existing, incoming);
  }
  if (
    isToolInputStream(existing) &&
    isToolInputStream(incoming) &&
    existing.toolCallId === incoming.toolCallId &&
    existing.runId !== undefined &&
    existing.runId === incoming.runId
  ) {
    return {
      ...existing,
      name: incoming.name || existing.name,
      delta: (existing.delta ?? '') + (incoming.delta ?? ''),
    };
  }
  return null;
}
function mergeDelta(existing: StreamDelta, incoming: StreamDelta): StreamDelta {
  return {
    ...existing,
    text: existing.text + incoming.text,
  };
}
export function coalesceStreamDeltas(events: SessionEvent[]): SessionEvent[] {
  if (events.length < 2) {
    return events;
  }
  const out: SessionEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    const merged = last ? mergeDeltaContinuation(last, event) : null;
    if (merged) {
      out[out.length - 1] = merged;
      continue;
    }
    out.push(event);
  }
  return out;
}
export function mergeIncomingEvent(
  existing: SessionEvent | undefined,
  incoming: SessionEvent,
): SessionEvent {
  if (!existing) {
    return incoming;
  }
  return mergeDeltaContinuation(existing, incoming) ?? incoming;
}
