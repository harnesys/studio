import type { Journal, StreamEvent } from '@studio/shared';
import { isHumanEntry } from '@studio/shared';
import { create } from 'zustand';

import { applyStreamEvent } from './apply-stream-event';

export type RunFailure = { id: string; threadId: string; text: string };

export type ActiveRun = {
  runId: string | null;
  abortController: AbortController;
};

type JournalStore = {
  journals: Record<string, Journal>;
  /** Bumps on every journal write so viewers can re-mark-read while at end. */
  contentEpoch: Record<string, number>;
  failures: RunFailure[];
  /** Active client SSE drains, keyed by threadId. */
  activeRuns: Record<string, ActiveRun>;
  journalOf: (threadId: string) => Journal;
  replaceJournal: (threadId: string, journal: Journal) => void;
  applyEvent: (threadId: string, event: StreamEvent) => void;
  isStreaming: (threadId: string) => boolean;
  runIdOf: (threadId: string) => string | null;
  startRun: (threadId: string, abortController: AbortController, runId?: string | null) => void;
  setRunId: (threadId: string, runId: string) => void;
  finishRun: (threadId: string, runId?: string | null) => void;
  abortRun: (threadId: string) => void;
  removeForThreads: (threadIds: string[]) => void;
  setFailure: (failure: RunFailure) => void;
  /** Local UX: edit human entry text */
  editHumanText: (threadId: string, entryId: string, text: string) => void;
  /** Local UX: remove an entry */
  removeEntry: (threadId: string, entryId: string) => void;
  /** Local branch: copy entries through entryId into target thread */
  copyPrefix: (sourceThreadId: string, throughEntryId: string, targetThreadId: string) => void;
};

const emptyJournal = (): Journal => ({ entries: [] });

export const useJournalStore = create<JournalStore>((set, get) => ({
  journals: {},
  contentEpoch: {},
  failures: [],
  activeRuns: {},

  journalOf: (threadId) => get().journals[threadId] ?? emptyJournal(),

  replaceJournal: (threadId, journal) => {
    set((state) => ({
      journals: { ...state.journals, [threadId]: journal },
      contentEpoch: {
        ...state.contentEpoch,
        [threadId]: (state.contentEpoch[threadId] ?? 0) + 1,
      },
    }));
  },

  applyEvent: (threadId, event) => {
    set((state) => {
      const current = state.journals[threadId] ?? emptyJournal();
      return {
        journals: {
          ...state.journals,
          [threadId]: applyStreamEvent(current, event),
        },
        contentEpoch: {
          ...state.contentEpoch,
          [threadId]: (state.contentEpoch[threadId] ?? 0) + 1,
        },
      };
    });
  },

  isStreaming: (threadId) => Boolean(get().activeRuns[threadId]),

  runIdOf: (threadId) => get().activeRuns[threadId]?.runId ?? null,

  startRun: (threadId, abortController, runId = null) => {
    const prev = get().activeRuns[threadId];
    if (prev && prev.abortController !== abortController) {
      prev.abortController.abort();
    }
    set((state) => ({
      activeRuns: {
        ...state.activeRuns,
        [threadId]: { abortController, runId },
      },
    }));
  },

  setRunId: (threadId, runId) => {
    set((state) => {
      const current = state.activeRuns[threadId];
      if (!current) {
        return state;
      }
      return {
        activeRuns: {
          ...state.activeRuns,
          [threadId]: { ...current, runId },
        },
      };
    });
  },

  finishRun: (threadId, runId = null) => {
    set((state) => {
      const current = state.activeRuns[threadId];
      if (!current) {
        return state;
      }
      if (runId != null && current.runId != null && current.runId !== runId) {
        return state;
      }
      const { [threadId]: _, ...rest } = state.activeRuns;
      return { activeRuns: rest };
    });
  },

  abortRun: (threadId) => {
    const current = get().activeRuns[threadId];
    if (!current) {
      return;
    }
    current.abortController.abort();
    set((state) => {
      const { [threadId]: _, ...rest } = state.activeRuns;
      return { activeRuns: rest };
    });
  },

  removeForThreads: (threadIds) => {
    const ids = new Set(threadIds);
    set((state) => {
      const journals = { ...state.journals };
      const activeRuns = { ...state.activeRuns };
      for (const id of ids) {
        delete journals[id];
        delete activeRuns[id];
      }
      return {
        journals,
        activeRuns,
        failures: state.failures.filter((item) => !ids.has(item.threadId)),
      };
    });
  },

  setFailure: (failure) => {
    set((state) => ({
      failures: [...state.failures.filter((item) => item.id !== failure.id), failure],
    }));
  },

  editHumanText: (threadId, entryId, text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    set((state) => {
      const journal = state.journals[threadId];
      if (!journal) {
        return state;
      }
      const index = journal.entries.findIndex((item) => item.id === entryId);
      if (index < 0) {
        return state;
      }
      const entry = journal.entries[index];
      if (!entry || !isHumanEntry(entry)) {
        return state;
      }
      const entries = journal.entries.slice();
      entries[index] = { ...entry, text: trimmed };
      return {
        journals: { ...state.journals, [threadId]: { ...journal, entries } },
      };
    });
  },

  removeEntry: (threadId, entryId) => {
    set((state) => {
      const journal = state.journals[threadId];
      if (!journal) {
        return state;
      }
      return {
        journals: {
          ...state.journals,
          [threadId]: {
            ...journal,
            entries: journal.entries.filter((item) => item.id !== entryId),
          },
        },
      };
    });
  },

  copyPrefix: (sourceThreadId, throughEntryId, targetThreadId) => {
    const source = get().journals[sourceThreadId];
    if (!source) {
      return;
    }
    const cut = source.entries.findIndex((item) => item.id === throughEntryId);
    if (cut < 0) {
      return;
    }
    const through = source.entries[cut];
    if (!through) {
      return;
    }
    // COW prefix: same id/seq (incl. compaction); fold cut stays valid on the branch.
    const copied = source.entries.slice(0, cut + 1).map((entry) => structuredClone(entry));
    set((state) => ({
      journals: {
        ...state.journals,
        [targetThreadId]: {
          entries: copied,
          branch: {
            fromThreadId: sourceThreadId,
            fromEntryId: through.id,
            fromSeq: through.seq,
          },
        },
      },
    }));
  },
}));
