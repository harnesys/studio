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

/**
 * Стабильный слот стримингового блока. Считается от первого токена блока
 * (`slotSeq`), поэтому переиспользование моделью одного id на несколько
 * блоков (`txt-0` шаг за шагом) не склеивает разные блоки в один слот.
 */
export function streamDeltaKey(event: SessionEvent, slotSeq: number): string | null {
  if (!isStreamDelta(event) || !event.runId || event.id === undefined) {
    return null;
  }
  return `${event.type}:${event.runId}:${event.id}:${slotSeq}`;
}

/** true, если incoming продолжает open-блок existing (тот же тип, ран и id блока). */
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

/** Конкатенация токенов блока; `null`, если это не продолжение дельты. */
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

/**
 * Склейка токенов блока: поля берёт первый токен (стабильные `seq`/`id`),
 * текст конкатенируется. Иначе слот «уезжает» по seq и перестаёт
 * совпадать с серверным блоком при reconcile.
 */
function mergeDelta(existing: StreamDelta, incoming: StreamDelta): StreamDelta {
  return {
    ...existing,
    text: existing.text + incoming.text,
  };
}

/**
 * Склеивает подряд идущие text/reasoning-delta с одним id и tool-input
 * streaming с одним toolCallId. Сырой лог хранит токены по кадру.
 */
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

/** Merge an incoming delta into an existing same-slot event, or return incoming. */
export function mergeIncomingEvent(
  existing: SessionEvent | undefined,
  incoming: SessionEvent,
): SessionEvent {
  if (!existing) {
    return incoming;
  }
  return mergeDeltaContinuation(existing, incoming) ?? incoming;
}
