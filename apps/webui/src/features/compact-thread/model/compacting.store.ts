import { create } from 'zustand';

type CompactingStore = {
  byThread: Record<string, true>;
  begin(threadId: string): void;
  end(threadId: string): void;
  isCompacting(threadId: string): boolean;
};
export const useCompactingStore = create<CompactingStore>((set, get) => ({
  byThread: {},
  begin(threadId) {
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: true },
    }));
  },
  end(threadId) {
    set((state) => {
      if (!state.byThread[threadId]) {
        return state;
      }
      const { [threadId]: _, ...rest } = state.byThread;
      return { byThread: rest };
    });
  },
  isCompacting(threadId) {
    return Boolean(get().byThread[threadId]);
  },
}));
