import type { SessionEvent } from '@harnesys/studio-shared';

import { streamDeltaKey } from './coalesce-events.ts';

/**
 * Идентичность событий ленты: стабильные ключи для слияния и arrival-меток,
 * максимумы seq по ранам. Чистые функции без доступа к стору.
 */

let timestampCounter = 0;

/** Стабильный ключ события для arrival-меток и слияния; переиспользуется в spawn-groups. */
export function stableEventKey(ev: SessionEvent): string | undefined {
  if ('clientEventId' in ev && ev.clientEventId) {
    return `ce:${ev.clientEventId}`;
  }
  if (ev.runId !== undefined && ev.seq !== undefined) {
    // Дельта-слот якорится по seq своего первого токена: модель переиспользует
    // id блока (txt-0) на шаги рана, без seq разные блоки столкнулись бы в один.
    return streamDeltaKey(ev, ev.seq) ?? `${ev.runId}:${ev.seq}`;
  }
  return undefined;
}

/**
 * Ключ события со счётчиковым фолбэком для событий без стабильного
 * идентификатора. Фолбэк нестабилен (новый ключ при каждом вызове),
 * поэтому для arrival-меток использовать только `stableEventKey`.
 */
export function eventKey(ev: SessionEvent): string {
  return stableEventKey(ev) ?? `t:${timestampCounter++}`;
}

/** Стабильные ключи пачки событий; события без ключа в arrival-метки не попадают. */
export function stableKeys(events: SessionEvent[]): string[] {
  const keys: string[] = [];
  for (const ev of events) {
    const key = stableEventKey(ev);
    if (key !== undefined) {
      keys.push(key);
    }
  }
  return keys;
}

/** Добивает arrival-метки для ключей, которых ещё нет; first-seen не перетирается. */
export function fillSeenAt(
  prev: Record<string, Record<string, number>>,
  threadId: string,
  keys: string[],
  now: number,
): Record<string, Record<string, number>> {
  const threadSeen = prev[threadId];
  let next: Record<string, number> | undefined;
  for (const key of keys) {
    if (threadSeen?.[key] === undefined && next?.[key] === undefined) {
      next = { ...threadSeen, ...next, [key]: now };
    }
  }
  if (next === undefined) {
    return prev;
  }
  return { ...prev, [threadId]: next };
}

/** Максимумы seq по ранам: сид для дедупа at-least-once после полной загрузки лога. */
export function ceilFromEvents(events: SessionEvent[]): Record<string, number> {
  const ceil: Record<string, number> = {};
  for (const ev of events) {
    if (ev.runId !== undefined && ev.seq !== undefined) {
      ceil[ev.runId] = Math.max(ceil[ev.runId] ?? 0, ev.seq);
    }
  }
  return ceil;
}

/** Поднимает ceil рана до seq принятого кадра; без runId/seq — без изменений. */
export function bumpCeil(
  seqCeil: Record<string, Record<string, number>>,
  threadId: string,
  event: SessionEvent,
): Record<string, Record<string, number>> {
  const { runId, seq } = event;
  if (runId === undefined || seq === undefined) {
    return seqCeil;
  }
  const thread = seqCeil[threadId] ?? {};
  if (seq <= (thread[runId] ?? 0)) {
    return seqCeil;
  }
  return { ...seqCeil, [threadId]: { ...thread, [runId]: seq } };
}
