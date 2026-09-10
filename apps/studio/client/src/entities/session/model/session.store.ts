import type { SessionEvent, SessionEventType } from '@studio/shared';
import { create } from 'zustand';

import {
  coalesceStreamDeltas,
  mergeDeltaContinuation,
  mergeIncomingEvent,
} from './coalesce-events';
import {
  bumpCeil,
  ceilFromEvents,
  eventKey,
  fillSeenAt,
  stableEventKey,
  stableKeys,
} from './event-keys';

export type ActiveRun = {
  runId: string;
  controller: AbortController;
};

export type RunFailure = {
  id: string;
  threadId: string;
  text: string;
};

type SessionStoreState = {
  events: Record<string, SessionEvent[]>;
  /** Первый замеченный arrival-метка по ключу события в треде. История её не имеет. */
  seenAt: Record<string, Record<string, number>>;
  /** Принятый максимум seq по ранам треда: дедуп at-least-once доставки фида. */
  seqCeil: Record<string, Record<string, number>>;
  activeRuns: Record<string, ActiveRun>;
  failures: RunFailure[];
  contentEpoch: Record<string, number>;
};

type SessionStoreActions = {
  eventsOf: (threadId: string) => SessionEvent[];
  replaceEvents: (threadId: string, events: SessionEvent[]) => void;
  reconcileEvents: (threadId: string, events: SessionEvent[]) => void;
  appendEvent: (threadId: string, event: SessionEvent) => void;
  removeEventByClientEventId: (threadId: string, clientEventId: string) => void;
  startRun: (threadId: string, controller: AbortController, runId?: string) => void;
  finishRun: (threadId: string, runId?: string) => void;
  abortRun: (threadId: string) => void;
  setRunId: (threadId: string, runId: string) => void;
  runIdOf: (threadId: string) => string | undefined;
  isStreaming: (threadId: string) => boolean;
  setFailure: (failure: RunFailure) => void;
  removeForThreads: (threadIds: string[]) => void;
  copyEvents: (fromThreadId: string, toThreadId: string) => void;
};

const EMPTY_EVENTS: SessionEvent[] = [];

/** Throttle read-sync epoch bumps during token spam. */
const EPOCH_DELTA_MS = 400;
const lastEpochBump: Record<string, number> = {};

function isStreamDeltaType(type: SessionEventType): boolean {
  return type === 'text-delta' || type === 'reasoning-delta';
}

function nextEpoch(
  state: SessionStoreState,
  threadId: string,
  eventType: SessionEventType,
): Record<string, number> {
  const now = Date.now();
  if (isStreamDeltaType(eventType)) {
    const prev = lastEpochBump[threadId] ?? 0;
    if (now - prev < EPOCH_DELTA_MS) {
      return state.contentEpoch;
    }
  }
  lastEpochBump[threadId] = now;
  return { ...state.contentEpoch, [threadId]: now };
}

export const useSessionStore = create<SessionStoreState & SessionStoreActions>((set, get) => ({
  events: {},
  seenAt: {},
  seqCeil: {},
  activeRuns: {},
  failures: [],
  contentEpoch: {},

  eventsOf(threadId: string) {
    return get().events[threadId] ?? EMPTY_EVENTS;
  },

  replaceEvents(threadId, events) {
    const coalesced = coalesceStreamDeltas(events);
    const now = Date.now();
    set((state) => ({
      events: { ...state.events, [threadId]: coalesced },
      seenAt: fillSeenAt(state.seenAt, threadId, stableKeys(coalesced), now),
      seqCeil: { ...state.seqCeil, [threadId]: ceilFromEvents(events) },
      contentEpoch: { ...state.contentEpoch, [threadId]: now },
    }));
  },

  reconcileEvents(threadId, serverEvents) {
    const now = Date.now();
    set((state) => {
      const existing = state.events[threadId] ?? EMPTY_EVENTS;
      // Слияние по ключу сохраняет порядок вставки: позицию держит первое
      // вхождение (optimistic или live), серверная строка подменяет значение.
      // Delta-слот якорится seq первого токена блока, поэтому блоки с
      // переиспользованным id (txt-0) не схлопываются в один.
      const byKey = new Map<string, SessionEvent>();
      for (const ev of existing) {
        byKey.set(eventKey(ev), ev);
      }
      // Полный серверный лог — источник правды: delta-слоты уже склеены,
      // подмена по ключу, без конкатенации с live-копией (иначе удвоение текста).
      const serverCoalesced = coalesceStreamDeltas(serverEvents);
      for (const ev of serverCoalesced) {
        byKey.set(eventKey(ev), ev);
      }
      const merged = [...byKey.values()];
      const ceil = ceilFromEvents(serverEvents);
      const prevCeil = state.seqCeil[threadId] ?? {};
      for (const [runId, seq] of Object.entries(prevCeil)) {
        ceil[runId] = Math.max(ceil[runId] ?? 0, seq);
      }
      return {
        events: { ...state.events, [threadId]: merged },
        seenAt: fillSeenAt(state.seenAt, threadId, stableKeys(merged), now),
        seqCeil: { ...state.seqCeil, [threadId]: ceil },
        contentEpoch: { ...state.contentEpoch, [threadId]: now },
      };
    });
  },

  appendEvent(threadId, event) {
    const now = Date.now();
    set((state) => {
      const current = state.events[threadId] ?? [];
      // Контракт фида — at-least-once; устаревший повтор кадра того же рана
      // не должен ни склеиваться в слот, ни открывать новый.
      if (
        event.runId !== undefined &&
        event.seq !== undefined &&
        event.seq <= (state.seqCeil[threadId]?.[event.runId] ?? 0)
      ) {
        return state;
      }
      const seenKey = stableEventKey(event);
      const seenAt = fillSeenAt(
        state.seenAt,
        threadId,
        seenKey === undefined ? [] : [seenKey],
        now,
      );
      const seqCeil = bumpCeil(state.seqCeil, threadId, event);
      const tail = current.length > 0 ? current[current.length - 1] : undefined;
      // Дельта продлевает только хвостовой слот. Новый блок с переиспользованным
      // id (следующий шаг генерации) открывает свой слот в конце ленты,
      // а не уезжает в старый — из-за этого текст и «прокидывался наверх».
      if (tail !== undefined && isStreamDeltaType(event.type)) {
        const merged = mergeDeltaContinuation(tail, event);
        const next = merged !== null ? [...current.slice(0, -1), merged] : [...current, event];
        return {
          events: { ...state.events, [threadId]: next },
          seenAt,
          seqCeil,
          contentEpoch: nextEpoch(state, threadId, event.type),
        };
      }
      const key = eventKey(event);
      const index = current.findIndex((ev) => eventKey(ev) === key);
      if (index === -1) {
        return {
          events: { ...state.events, [threadId]: [...current, event] },
          seenAt,
          seqCeil,
          contentEpoch: nextEpoch(state, threadId, event.type),
        };
      }
      const next = [...current];
      next[index] = mergeIncomingEvent(current[index], event);
      return {
        events: { ...state.events, [threadId]: next },
        seenAt,
        seqCeil,
        contentEpoch: nextEpoch(state, threadId, event.type),
      };
    });
  },

  removeEventByClientEventId(threadId, clientEventId) {
    set((state) => {
      const current = state.events[threadId];
      if (current === undefined) {
        return state;
      }
      const key = `ce:${clientEventId}`;
      const next = current.filter((ev) => eventKey(ev) !== key);
      if (next.length === current.length) {
        return state;
      }
      const threadSeen = state.seenAt[threadId];
      if (threadSeen?.[key] === undefined) {
        return {
          events: { ...state.events, [threadId]: next },
          contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
        };
      }
      const { [key]: _removed, ...restSeen } = threadSeen;
      return {
        events: { ...state.events, [threadId]: next },
        seenAt: { ...state.seenAt, [threadId]: restSeen },
        contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
      };
    });
  },

  startRun(threadId, controller, runId) {
    set((state) => ({
      activeRuns: {
        ...state.activeRuns,
        [threadId]: { runId: runId ?? '', controller },
      },
    }));
  },

  finishRun(threadId, runId) {
    set((state) => {
      const active = state.activeRuns[threadId];
      if (!active) {
        return state;
      }
      if (runId && active.runId && active.runId !== runId) {
        return state;
      }
      const { [threadId]: _, ...rest } = state.activeRuns;
      return { activeRuns: rest };
    });
  },

  abortRun(threadId) {
    const active = get().activeRuns[threadId];
    if (active) {
      active.controller.abort();
    }
    set((state) => {
      const { [threadId]: _, ...rest } = state.activeRuns;
      return { activeRuns: rest };
    });
  },

  setRunId(threadId, runId) {
    set((state) => {
      const active = state.activeRuns[threadId];
      if (!active) {
        return state;
      }
      return {
        activeRuns: {
          ...state.activeRuns,
          [threadId]: { ...active, runId },
        },
      };
    });
  },

  runIdOf(threadId) {
    return get().activeRuns[threadId]?.runId;
  },

  isStreaming(threadId) {
    return Boolean(get().activeRuns[threadId]);
  },

  setFailure(failure) {
    set((state) => ({
      failures: [...state.failures.filter((item) => item.id !== failure.id), failure],
    }));
  },

  removeForThreads(threadIds) {
    set((state) => {
      const events = { ...state.events };
      const seenAt = { ...state.seenAt };
      const seqCeil = { ...state.seqCeil };
      const activeRuns = { ...state.activeRuns };
      const contentEpoch = { ...state.contentEpoch };
      for (const id of threadIds) {
        delete events[id];
        delete seenAt[id];
        delete seqCeil[id];
        delete activeRuns[id];
        delete contentEpoch[id];
        delete lastEpochBump[id];
      }
      return { events, seenAt, seqCeil, activeRuns, contentEpoch };
    });
  },

  copyEvents(fromThreadId, toThreadId) {
    const source = get().events[fromThreadId];
    if (source) {
      const sourceSeen = get().seenAt[fromThreadId];
      const sourceCeil = get().seqCeil[fromThreadId];
      set((state) => ({
        events: { ...state.events, [toThreadId]: [...source] },
        ...(sourceSeen === undefined
          ? {}
          : { seenAt: { ...state.seenAt, [toThreadId]: { ...sourceSeen } } }),
        ...(sourceCeil === undefined
          ? {}
          : { seqCeil: { ...state.seqCeil, [toThreadId]: { ...sourceCeil } } }),
      }));
    }
  },
}));
