import type { TranscriptEntry } from '@studio/shared';

export type TurnSegment =
  | { type: 'activity'; items: Array<Extract<TranscriptEntry, { type: 'reasoning' | 'tool' }>> }
  | { type: 'text'; entry: Extract<TranscriptEntry, { type: 'text' }> }
  | { type: 'ask'; entry: Extract<TranscriptEntry, { type: 'ask' }> };

export function groupSegments(entries: TranscriptEntry[]): TurnSegment[] {
  const segments: TurnSegment[] = [];
  let activity: Array<Extract<TranscriptEntry, { type: 'reasoning' | 'tool' }>> = [];

  const flushActivity = () => {
    if (activity.length === 0) {
      return;
    }
    segments.push({ type: 'activity', items: activity });
    activity = [];
  };

  for (const entry of entries) {
    if (entry.type === 'reasoning' || entry.type === 'tool') {
      activity.push(entry);
      continue;
    }
    flushActivity();
    if (entry.type === 'ask') {
      segments.push({ type: 'ask', entry });
      continue;
    }
    segments.push({ type: 'text', entry });
  }
  flushActivity();
  return segments;
}

export function segmentKey(segment: TurnSegment, index: number): string {
  if (segment.type === 'text' || segment.type === 'ask') {
    return segment.entry.step.id;
  }
  const first = segment.items[0];
  if (!first) {
    return `activity-${index}`;
  }
  return first.type === 'reasoning' ? first.step.id : first.call.id;
}

export function segmentSpacing(segments: TurnSegment[], index: number): string | undefined {
  if (index === 0) {
    return undefined;
  }
  const prev = segments[index - 1];
  const curr = segments[index];
  if (prev?.type === 'activity' && (curr?.type === 'text' || curr?.type === 'ask')) {
    return 'mt-4';
  }
  if ((prev?.type === 'text' || prev?.type === 'ask') && curr?.type === 'activity') {
    return 'mt-3';
  }
  return 'mt-3';
}
