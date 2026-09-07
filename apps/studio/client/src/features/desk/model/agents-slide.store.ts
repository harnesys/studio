import { create } from 'zustand';

type AgentsSlideState = {
  agentId: string | null;
  open: (agentId: string) => void;
  back: () => void;
  reset: () => void;
};

export const useAgentsSlideStore = create<AgentsSlideState>((set) => ({
  agentId: null,
  open: (agentId) => set({ agentId }),
  back: () => set({ agentId: null }),
  reset: () => set({ agentId: null }),
}));
