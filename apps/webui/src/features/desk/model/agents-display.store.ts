import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENTS_DISPLAY_STORAGE_KEY } from '@/shared/config/constants';

type AgentsDisplayState = {
  expanded: Record<string, boolean>;
  toggle: (agentId: string) => void;
  expand: (agentId: string) => void;
  forget: (agentId: string) => void;
};
export const useAgentsDisplayStore = create<AgentsDisplayState>()(
  persist(
    (set) => ({
      expanded: {},
      toggle: (agentId) =>
        set((state) => ({
          expanded: { ...state.expanded, [agentId]: !state.expanded[agentId] },
        })),
      expand: (agentId) =>
        set((state) =>
          state.expanded[agentId] ? state : { expanded: { ...state.expanded, [agentId]: true } },
        ),
      forget: (agentId) =>
        set((state) => {
          if (!(agentId in state.expanded)) {
            return state;
          }
          const expanded = { ...state.expanded };
          delete expanded[agentId];
          return { expanded };
        }),
    }),
    {
      name: AGENTS_DISPLAY_STORAGE_KEY,
      version: 2,
      partialize: (state) => ({ expanded: state.expanded }),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<AgentsDisplayState>;
        return {
          expanded:
            state.expanded && typeof state.expanded === 'object'
              ? Object.fromEntries(
                  Object.entries(state.expanded).filter(([, value]) => typeof value === 'boolean'),
                )
              : {},
        } as AgentsDisplayState;
      },
    },
  ),
);
