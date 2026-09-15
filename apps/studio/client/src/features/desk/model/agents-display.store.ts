import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENTS_DISPLAY_STORAGE_KEY } from '@/shared/config/constants';
import { useAgentsSlideStore } from './agents-slide.store';

export const AGENTS_THREAD_MODES = ['panel', 'inline'] as const;
export type AgentsThreadMode = (typeof AGENTS_THREAD_MODES)[number];

export const AGENTS_THREAD_MODE_LABELS: Record<AgentsThreadMode, string> = {
  panel: 'Panel',
  inline: 'Inline',
};

export const AGENTS_THREAD_MODE_HINTS: Record<AgentsThreadMode, string> = {
  panel: 'Open an agent to see its threads.',
  inline: 'Threads live under each agent.',
};

export function isAgentsThreadMode(value: unknown): value is AgentsThreadMode {
  return typeof value === 'string' && (AGENTS_THREAD_MODES as readonly string[]).includes(value);
}

type AgentsDisplayState = {
  mode: AgentsThreadMode;
  expanded: Record<string, boolean>;
  setMode: (mode: AgentsThreadMode) => void;
  toggle: (agentId: string) => void;
  expand: (agentId: string) => void;
  forget: (agentId: string) => void;
};

export const useAgentsDisplayStore = create<AgentsDisplayState>()(
  persist(
    (set) => ({
      mode: 'panel',
      expanded: {},
      setMode: (mode) => {
        if (mode === 'inline') {
          useAgentsSlideStore.getState().reset();
        }
        set({ mode });
      },
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
      version: 1,
      partialize: (state) => ({ mode: state.mode, expanded: state.expanded }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<AgentsDisplayState>;
        return {
          mode: version >= 1 && isAgentsThreadMode(state.mode) ? state.mode : 'panel',
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
