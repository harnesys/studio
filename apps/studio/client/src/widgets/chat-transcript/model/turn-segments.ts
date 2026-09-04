import type { SessionEvent } from '@studio/shared';

export type TurnSegment =
  | { type: 'activity'; events: SessionEvent[] }
  | { type: 'user'; event: SessionEvent & { type: 'user' } }
  | { type: 'text'; text: string; id: string | undefined };

/**
 * Единственная проекция «лог событий → сегменты треда». Все пути (live,
 * reconcile, reload) прогоняют сырой лог отсюда: подряд идущие text-delta
 * с равным id сворачиваются в один текстовый блок, смена id или любая
 * активность между дельтами открывает новый блок.
 */
export function groupSegments(events: SessionEvent[]): TurnSegment[] {
  const segments: TurnSegment[] = [];
  let activity: SessionEvent[] = [];

  const flushActivity = () => {
    if (activity.length === 0) {
      return;
    }
    segments.push({ type: 'activity', events: activity });
    activity = [];
  };

  for (const ev of events) {
    if (ev.type === 'user') {
      flushActivity();
      segments.push({ type: 'user', event: ev as SessionEvent & { type: 'user' } });
      continue;
    }
    if (ev.type === 'text-delta') {
      flushActivity();
      const last = segments[segments.length - 1];
      if (last?.type === 'text' && last.id === ev.id) {
        last.text += ev.text;
      } else {
        segments.push({ type: 'text', text: ev.text, id: ev.id });
      }
      continue;
    }
    if (
      ev.type === 'tool' ||
      ev.type === 'ask' ||
      ev.type === 'reasoning-delta' ||
      ev.type === 'reasoning-start' ||
      ev.type === 'reasoning-end' ||
      ev.type === 'source' ||
      ev.type === 'file'
    ) {
      activity.push(ev);
    }
  }
  flushActivity();
  return segments;
}

export function segmentKey(segment: TurnSegment, index: number): string {
  if (segment.type === 'user') {
    return `user-${segment.event.clientEventId ?? `${index}-${segment.event.text.slice(0, 20)}`}`;
  }
  if (segment.type === 'text') {
    // id блока не уникален между блоками (модель может reuse 'txt-0'),
    // уникальность даёт позиция в списке сегментов.
    return `text-${index}-${segment.id ?? 'x'}`;
  }
  const first = segment.events[0];
  if (!first) {
    return `activity-${index}`;
  }
  if (first.type === 'tool') {
    return first.toolCallId;
  }
  return `activity-${index}`;
}

/** Ритм вертикальных отступов между сегментами одного треда. */
export function segmentSpacing(segments: TurnSegment[], index: number): string | undefined {
  if (index === 0) {
    return undefined;
  }
  const prev = segments[index - 1];
  const curr = segments[index];
  if (prev?.type === 'user' || curr?.type === 'user') {
    return 'mt-5';
  }
  if (prev?.type === 'activity' && curr?.type === 'text') {
    return 'mt-4';
  }
  return 'mt-3';
}
