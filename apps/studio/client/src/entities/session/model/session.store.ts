import type { SessionEvent, SessionEventType } from '@harnesys/studio-shared';
import { create } from 'zustand';

import { applyIncomingEvents } from './apply-incoming';
import { coalesceStreamDeltas, isToolInputStream } from './coalesce-events';
import { ceilFromEvents, eventKey, fillSeenAt, stableEventKey, stableKeys } from './event-keys';
import { clearLiveTail, clearLiveTails, ingestLiveDelta, sealLiveTail } from './live-tail';
import {
  cancelEpochFlush,
  dropPendingThreads,
  enqueuePending,
  hasPending,
  scheduleEpochFlush,
  takePending,
} from './pending-appends';

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
  /** Оптимистичные skills отправленного user-события по ключу `ce:${clientEventId}`. */
  sentSkills: Record<string, string[]>;
};

type SessionStoreActions = {
  eventsOf: (threadId: string) => SessionEvent[];
  replaceEvents: (threadId: string, events: SessionEvent[]) => void;
  reconcileEvents: (threadId: string, events: SessionEvent[]) => void;
  appendEvent: (threadId: string, event: SessionEvent) => void;
  removeEventByClientEventId: (threadId: string, clientEventId: string) => void;
  setSentSkills: (threadId: string, clientEventId: string, skills: string[]) => void;
  sentSkillsFor: (clientEventId: string) => string[] | undefined;
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

/** Backstop: склеить live-дельты в лог, если долго нет tool/start/end. */
const EPOCH_DELTA_MS = 400;

function isStreamDeltaType(type: SessionEventType): boolean {
  return type === 'text-delta' || type === 'reasoning-delta';
}

function bumpEpoch(state: SessionStoreState, threadId: string): Record<string, number> {
  return { ...state.contentEpoch, [threadId]: Date.now() };
}

function applyBatches(
  state: SessionStoreState,
  batches: Map<string, SessionEvent[]>,
): SessionStoreState {
  if (batches.size === 0) {
    return state;
  }
  const now = Date.now();
  let next = state;
  for (const [threadId, incoming] of batches) {
    const result = applyIncomingEvents(
      {
        events: next.events[threadId] ?? EMPTY_EVENTS,
        seenAt: next.seenAt[threadId] ?? {},
        seqCeil: next.seqCeil[threadId] ?? {},
      },
      incoming,
      now,
    );
    if (result.accepted === 0) {
      continue;
    }
    next = {
      ...next,
      events: { ...next.events, [threadId]: result.events },
      seenAt: { ...next.seenAt, [threadId]: result.seenAt },
      seqCeil: { ...next.seqCeil, [threadId]: result.seqCeil },
      contentEpoch: bumpEpoch(next, threadId),
    };
  }
  return next;
}

export const useSessionStore = create<SessionStoreState & SessionStoreActions>((set, get) => {
  const flushPending = () => {
    cancelEpochFlush();
    if (!hasPending()) {
      return;
    }
    set((state) => applyBatches(state, takePending()));
  };

  return {
    events: {},
    seenAt: {},
    seqCeil: {},
    activeRuns: {},
    failures: [],
    contentEpoch: {},
    sentSkills: {},

    eventsOf(threadId: string) {
      return get().events[threadId] ?? EMPTY_EVENTS;
    },

    replaceEvents(threadId, events) {
      clearLiveTail(threadId);
      const coalesced = coalesceStreamDeltas(events);
      const now = Date.now();
      set((state) => {
        const base = applyBatches(state, takePending());
        return {
          events: { ...base.events, [threadId]: coalesced },
          seenAt: fillSeenAt(base.seenAt, threadId, stableKeys(coalesced), now),
          seqCeil: { ...base.seqCeil, [threadId]: ceilFromEvents(events) },
          contentEpoch: { ...base.contentEpoch, [threadId]: now },
        };
      });
    },

    reconcileEvents(threadId, serverEvents) {
      clearLiveTail(threadId);
      const now = Date.now();
      set((state) => {
        const base = applyBatches(state, takePending());
        const existing = base.events[threadId] ?? EMPTY_EVENTS;
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
        const prevCeil = base.seqCeil[threadId] ?? {};
        for (const [runId, seq] of Object.entries(prevCeil)) {
          ceil[runId] = Math.max(ceil[runId] ?? 0, seq);
        }
        return {
          events: { ...base.events, [threadId]: merged },
          seenAt: fillSeenAt(base.seenAt, threadId, stableKeys(merged), now),
          seqCeil: { ...base.seqCeil, [threadId]: ceil },
          contentEpoch: { ...base.contentEpoch, [threadId]: now },
        };
      });
    },

    appendEvent(threadId, event) {
      if (isStreamDeltaType(event.type)) {
        const phase = ingestLiveDelta(threadId, event);
        enqueuePending(threadId, event);
        if (phase === 'open') {
          flushPending();
          return;
        }
        scheduleEpochFlush(flushPending, EPOCH_DELTA_MS);
        return;
      }
      if (isToolInputStream(event)) {
        enqueuePending(threadId, event);
        if (!event.delta) {
          flushPending();
          return;
        }
        scheduleEpochFlush(flushPending, EPOCH_DELTA_MS);
        return;
      }
      sealLiveTail(threadId);
      enqueuePending(threadId, event);
      flushPending();
    },

    removeEventByClientEventId(threadId, clientEventId) {
      set((state) => {
        const base = applyBatches(state, takePending());
        const current = base.events[threadId];
        if (current === undefined) {
          return base;
        }
        const key = `ce:${clientEventId}`;
        const next = current.filter((ev) => eventKey(ev) !== key);
        if (next.length === current.length) {
          return base;
        }
        const { [key]: _gone, ...sentSkills } = base.sentSkills;
        const stripped = {
          ...base,
          events: { ...base.events, [threadId]: next },
          sentSkills,
          contentEpoch: { ...base.contentEpoch, [threadId]: Date.now() },
        };
        const threadSeen = base.seenAt[threadId];
        if (threadSeen?.[key] === undefined) {
          return stripped;
        }
        const { [key]: _removed, ...restSeen } = threadSeen;
        return { ...stripped, seenAt: { ...base.seenAt, [threadId]: restSeen } };
      });
    },

    setSentSkills(_threadId, clientEventId, skills) {
      set((state) => ({ sentSkills: { ...state.sentSkills, [`ce:${clientEventId}`]: skills } }));
    },
    sentSkillsFor: (clientEventId) => get().sentSkills[`ce:${clientEventId}`],

    startRun(threadId, controller, runId) {
      set((state) => ({
        activeRuns: {
          ...state.activeRuns,
          [threadId]: { runId: runId ?? '', controller },
        },
      }));
    },

    finishRun(threadId, runId) {
      clearLiveTail(threadId);
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
      dropPendingThreads(threadIds);
      clearLiveTails(threadIds);
      set((state) => {
        const base = applyBatches(state, takePending());
        const events = { ...base.events };
        const seenAt = { ...base.seenAt };
        const seqCeil = { ...base.seqCeil };
        const activeRuns = { ...base.activeRuns };
        const contentEpoch = { ...base.contentEpoch };
        const sentSkills = { ...base.sentSkills };
        for (const id of threadIds) {
          for (const ev of events[id] ?? []) {
            delete sentSkills[stableEventKey(ev) ?? ''];
          }
          delete events[id];
          delete seenAt[id];
          delete seqCeil[id];
          delete activeRuns[id];
          delete contentEpoch[id];
        }
        return { ...base, events, seenAt, seqCeil, activeRuns, contentEpoch, sentSkills };
      });
    },

    copyEvents(fromThreadId, toThreadId) {
      set((state) => {
        const base = applyBatches(state, takePending());
        const source = base.events[fromThreadId];
        if (!source) {
          return base;
        }
        const sourceSeen = base.seenAt[fromThreadId];
        const sourceCeil = base.seqCeil[fromThreadId];
        return {
          ...base,
          events: { ...base.events, [toThreadId]: [...source] },
          ...(sourceSeen === undefined
            ? {}
            : { seenAt: { ...base.seenAt, [toThreadId]: { ...sourceSeen } } }),
          ...(sourceCeil === undefined
            ? {}
            : { seqCeil: { ...base.seqCeil, [toThreadId]: { ...sourceCeil } } }),
          contentEpoch: { ...base.contentEpoch, [toThreadId]: Date.now() },
        };
      });
    },
  };
});
