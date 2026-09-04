import type { SessionEvent } from '@studio/shared';
import { create } from 'zustand';

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

function eventKey(ev: SessionEvent): string {
  if ('clientEventId' in ev && ev.clientEventId) {
    return `ce:${ev.clientEventId}`;
  }
  if (ev.runId !== undefined && ev.seq !== undefined) {
    return `${ev.runId}:${ev.seq}`;
  }
  return `t:${timestampCounter++}`;
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
      events: { ...state.events, [threadId]: events },
      contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
    }));
  },

  reconcileEvents(threadId, serverEvents) {
    set((state) => {
      const existing = state.events[threadId] ?? EMPTY_EVENTS;
      // Слияние по ключу сохраняет порядок вставки: позицию держит первое
      // вхождение (optimistic или live), серверная строка подменяет значение.
      // Seq здесь не сортируется: он уникален внутри рана, между ранами
      // порядок задаёт сам лог (сервер отдаёт список уже упорядоченным).
      const byKey = new Map<string, SessionEvent>();
      for (const ev of existing) {
        byKey.set(eventKey(ev), ev);
      }
      for (const ev of serverEvents) {
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
      // Один идентитет — одно событие: серверное эхо заменяет optimistic-копию
      // на её месте; дельты хранятся сырыми, склейка выполняет проекция рендера.
      const key = eventKey(event);
      const index = current.findIndex((ev) => eventKey(ev) === key);
      if (index === -1) {
        return {
          events: { ...state.events, [threadId]: [...current, event] },
          contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
        };
      }
      const next = [...current];
      next[index] = event;
      return {
        events: { ...state.events, [threadId]: next },
        contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
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
