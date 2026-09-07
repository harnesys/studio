import type { SessionEvent } from '@studio/shared';
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

function eventKey(ev: SessionEvent): string {
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
  return `t:${timestampCounter++}`;
}

function isStreamDeltaType(type: SessionEvent['type']): boolean {
  return type === 'text-delta' || type === 'reasoning-delta';
}

function nextEpoch(
  state: SessionStoreState,
  threadId: string,
  eventType: SessionEvent['type'],
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
  activeRuns: {},
  failures: [],
  contentEpoch: {},

  eventsOf(threadId: string) {
    return get().events[threadId] ?? EMPTY_EVENTS;
  },

  replaceEvents(threadId, events) {
    set((state) => ({
      events: { ...state.events, [threadId]: coalesceStreamDeltas(events) },
      contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
    }));
  },

  reconcileEvents(threadId, serverEvents) {
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
      return {
        events: { ...state.events, [threadId]: [...byKey.values()] },
        contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
      };
    });
  },

  appendEvent(threadId, event) {
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
      if (index === -1) {
        return {
          events: { ...state.events, [threadId]: [...current, event] },
          contentEpoch: nextEpoch(state, threadId, event.type),
        };
      }
      const next = [...current];
      next[index] = mergeIncomingEvent(current[index], event);
      return {
        events: { ...state.events, [threadId]: next },
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
      return {
        events: { ...state.events, [threadId]: next },
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
      const activeRuns = { ...state.activeRuns };
      const contentEpoch = { ...state.contentEpoch };
      for (const id of threadIds) {
        delete events[id];
        delete activeRuns[id];
        delete contentEpoch[id];
        delete lastEpochBump[id];
      }
      return { events, activeRuns, contentEpoch };
    });
  },

  copyEvents(fromThreadId, toThreadId) {
    const source = get().events[fromThreadId];
    if (source) {
      set((state) => ({
        events: { ...state.events, [toThreadId]: [...source] },
      }));
    }
  },
}));
