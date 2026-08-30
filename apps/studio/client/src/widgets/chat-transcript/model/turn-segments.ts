import type { SessionEvent } from '@studio/shared';

export type TurnSegment =
  | { type: 'activity'; events: SessionEvent[] }
  | { type: 'text'; event: SessionEvent & { type: 'text-delta' } }
  | { type: 'ask'; event: SessionEvent & { type: 'ask' } };

export function groupSegments(events: SessionEvent[]): TurnSegment[] {
  const segments: TurnSegment[] = [];
  let activity: SessionEvent[] = [];

  const flushActivity = () => {
    if (activity.length === 0) return;
    segments.push({ type: 'activity', events: activity });
    activity = [];
  };

  for (const ev of events) {
    if (ev.type === 'text-delta') {
      flushActivity();
      segments.push({ type: 'text', event: ev });
      continue;
    }
    if (ev.type === 'ask') {
      flushActivity();
      segments.push({ type: 'ask', event: ev });
      continue;
    }
    if (ev.type === 'tool') {
      activity.push(ev);
      continue;
    }
  }
  flushActivity();
  return segments;
}

export function segmentKey(segment: TurnSegment, index: number): string {
  if (segment.type === 'text') return `text-${index}`;
  if (segment.type === 'ask') return segment.event.askId;
  const first = segment.events[0];
  if (!first) return `activity-${index}`;
  if (first.type === 'tool') return first.toolCallId;
  return `activity-${index}`;
}

export function segmentSpacing(segments: TurnSegment[], index: number): string | undefined {
  if (index === 0) return undefined;
  const prev = segments[index - 1];
  const curr = segments[index];
  if (prev?.type === 'activity' && (curr?.type === 'text' || curr?.type === 'ask')) return 'mt-4';
  if ((prev?.type === 'text' || prev?.type === 'ask') && curr?.type === 'activity') return 'mt-3';
  return 'mt-3';
}
