import type { PlanItemStatus, PlanStatus, ThreadPlanRecord } from '@harnesys/studio-shared';
import { create } from 'zustand';

export type { PlanItemStatus, PlanStatus, ThreadPlanRecord };

export function planProgress(plan: ThreadPlanRecord): {
  done: number;
  total: number;
} {
  const done = plan.items.filter(
    (item) =>
      item.status === 'completed' || item.status === 'cancelled' || item.status === 'failed',
  ).length;
  return { done, total: plan.items.length };
}

type PlanStore = {
  byThread: Record<string, ThreadPlanRecord>;
  byThreadId: (threadId: string | null | undefined) => ThreadPlanRecord | null;
  upsert: (plan: ThreadPlanRecord) => void;
  removeForThread: (threadId: string) => void;
};

export const usePlanStore = create<PlanStore>((set, get) => ({
  byThread: {},

  byThreadId: (threadId) => (threadId ? (get().byThread[threadId] ?? null) : null),

  upsert: (plan) => {
    set((state) => ({ byThread: { ...state.byThread, [plan.threadId]: plan } }));
  },

  removeForThread: (threadId) => {
    set((state) => {
      if (!state.byThread[threadId]) {
        return state;
      }
      const next = { ...state.byThread };
      delete next[threadId];
      return { byThread: next };
    });
  },
}));
