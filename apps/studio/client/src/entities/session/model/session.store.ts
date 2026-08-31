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
  appendEvent: (threadId: string, event: SessionEvent) => void;
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

  appendEvent(threadId, event) {
    set((state) => {
      const current = state.events[threadId] ?? [];
      const last = current[current.length - 1];
      if (
        last &&
        event.type === 'text-delta' &&
        last.type === 'text-delta' &&
        last.id === event.id
      ) {
        const merged: SessionEvent = { ...last, text: last.text + event.text };
        return {
          events: { ...state.events, [threadId]: [...current.slice(0, -1), merged] },
          contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
        };
      }
      if (
        last &&
        event.type === 'reasoning-delta' &&
        last.type === 'reasoning-delta' &&
        last.id === event.id
      ) {
        const merged: SessionEvent = { ...last, text: last.text + event.text };
        return {
          events: { ...state.events, [threadId]: [...current.slice(0, -1), merged] },
          contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
        };
      }
      if (
        last &&
        event.type === 'tool' &&
        last.type === 'tool' &&
        last.phase === 'streaming' &&
        event.phase === 'streaming' &&
        last.toolCallId === event.toolCallId
      ) {
        const merged: SessionEvent = {
          ...last,
          delta: (last.delta ?? '') + (event.delta ?? ''),
        };
        return {
          events: { ...state.events, [threadId]: [...current.slice(0, -1), merged] },
          contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
        };
      }
      return {
        events: { ...state.events, [threadId]: [...current, event] },
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
