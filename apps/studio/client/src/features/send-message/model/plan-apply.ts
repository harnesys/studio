import { create } from 'zustand';

import { sendMessage } from './send-message';

export const PLAN_APPLY_KICKOFF =
  'Execute the approved plan. Work through items in order; call plan_item_update with exact ids from the plan (plan_get if unsure).';

type PlanApplyState = {
  byThread: Record<string, true | undefined>;
  arm: (threadId: string) => void;
  clear: (threadId: string) => void;
};

export const usePlanApplyStore = create<PlanApplyState>((set) => ({
  byThread: {},
  arm: (threadId) =>
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: true },
    })),
  clear: (threadId) =>
    set((state) => {
      if (!state.byThread[threadId]) {
        return state;
      }
      const next = { ...state.byThread };
      delete next[threadId];
      return { byThread: next };
    }),
}));

export async function applyApprovedPlan(threadId: string): Promise<void> {
  usePlanApplyStore.getState().clear(threadId);
  await sendMessage({
    threadId,
    content: PLAN_APPLY_KICKOFF,
    mode: 'ask',
  });
}
