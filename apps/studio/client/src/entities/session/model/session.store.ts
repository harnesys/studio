import type { SessionEvent, SessionEventType } from '@studio/shared';
import { create } from 'zustand';

import { coalesceStreamDeltas, mergeIncomingEvent, streamDeltaKey } from './coalesce-events';

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

let timestampCounter = 0;

/** Throttle read-sync epoch bumps during token spam. */
const EPOCH_DELTA_MS = 400;
const lastEpochBump: Record<string, number> = {};

/** Стабильный ключ события для arrival-меток и слияния; переиспользуется в spawn-groups. */
export function stableEventKey(ev: SessionEvent): string | undefined {
  if ('clientEventId' in ev && ev.clientEventId) {
    return `ce:${ev.clientEventId}`;
  }
  const deltaKey = streamDeltaKey(ev);
  if (deltaKey) {
    return deltaKey;
  }
  if (ev.runId !== undefined && ev.seq !== undefined) {
    return `${ev.runId}:${ev.seq}`;
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
function stableKeys(events: SessionEvent[]): string[] {
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
function fillSeenAt(
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
      contentEpoch: { ...state.contentEpoch, [threadId]: now },
    }));
  },

  reconcileEvents(threadId, serverEvents) {
    const now = Date.now();
    set((state) => {
      const existing = state.events[threadId] ?? EMPTY_EVENTS;
      // Слияние по ключу сохраняет порядок вставки: позицию держит первое
      // вхождение (optimistic или live), серверная строка подменяет значение.
      // Delta-слоты склеены: один ключ на (type, runId, id), текст конкатенируется.
      const byKey = new Map<string, SessionEvent>();
      for (const ev of existing) {
        byKey.set(eventKey(ev), ev);
      }
      // Полный серверный лог — источник правды: delta-слоты уже склеены,
      // подмена по ключу, без конкатенации с live-копией (иначе удвоение текста).
      for (const ev of coalesceStreamDeltas(serverEvents)) {
        byKey.set(eventKey(ev), ev);
      }
      const merged = [...byKey.values()];
      return {
        events: { ...state.events, [threadId]: merged },
        seenAt: fillSeenAt(state.seenAt, threadId, stableKeys(merged), now),
        contentEpoch: { ...state.contentEpoch, [threadId]: now },
      };
    });
  },

  appendEvent(threadId, event) {
    const now = Date.now();
    set((state) => {
      const current = state.events[threadId] ?? [];
      const key = eventKey(event);
      // Live deltas almost always extend the tail slot — check it before O(n) scan.
      const lastIndex = current.length - 1;
      const tail = lastIndex >= 0 ? current[lastIndex] : undefined;
      const index =
        tail && eventKey(tail) === key
          ? lastIndex
          : current.findIndex((ev) => eventKey(ev) === key);
      const seenKey = stableEventKey(event);
      const seenAt = fillSeenAt(
        state.seenAt,
        threadId,
        seenKey === undefined ? [] : [seenKey],
        now,
      );
      if (index === -1) {
        return {
          events: { ...state.events, [threadId]: [...current, event] },
          seenAt,
          contentEpoch: nextEpoch(state, threadId, event.type),
        };
      }
      const next = [...current];
      next[index] = mergeIncomingEvent(current[index], event);
      return {
        events: { ...state.events, [threadId]: next },
        seenAt,
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
      const activeRuns = { ...state.activeRuns };
      const contentEpoch = { ...state.contentEpoch };
      for (const id of threadIds) {
        delete events[id];
        delete seenAt[id];
        delete activeRuns[id];
        delete contentEpoch[id];
        delete lastEpochBump[id];
      }
      return { events, seenAt, activeRuns, contentEpoch };
    });
  },

  copyEvents(fromThreadId, toThreadId) {
    const source = get().events[fromThreadId];
    if (source) {
      const sourceSeen = get().seenAt[fromThreadId];
      set((state) => ({
        events: { ...state.events, [toThreadId]: [...source] },
        ...(sourceSeen === undefined
          ? {}
          : { seenAt: { ...state.seenAt, [toThreadId]: { ...sourceSeen } } }),
      }));
    }
  },
}));
