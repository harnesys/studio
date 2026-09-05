import { create } from 'zustand';
import { SIDEBAR_ACCORDION_STORAGE_KEY } from '@/shared/config/constants';

export type AccordionState = {
  collapsed: Record<string, boolean>;
  sizes: Record<string, number>;
  toggle: (id: string) => void;
  setSizes: (sizes: Record<string, number>) => void;
};

const DEFAULT_SIZES: Record<string, number> = {
  agents: 1,
  explorer: 1,
  automations: 1,
  git: 1,
};

const DEFAULT_COLLAPSED: Record<string, boolean> = {
  agents: false,
  explorer: true,
  automations: true,
  git: true,
};

function load(): { collapsed: Record<string, boolean>; sizes: Record<string, number> } {
  try {
    const raw = localStorage.getItem(SIDEBAR_ACCORDION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        collapsed?: Record<string, boolean>;
        sizes?: Record<string, number>;
      };
      return {
        collapsed: { ...DEFAULT_COLLAPSED, ...parsed.collapsed },
        sizes: { ...DEFAULT_SIZES, ...parsed.sizes },
      };
    }
  } catch {}
  return { collapsed: { ...DEFAULT_COLLAPSED }, sizes: { ...DEFAULT_SIZES } };
}

function persist(collapsed: Record<string, boolean>, sizes: Record<string, number>): void {
  try {
    localStorage.setItem(SIDEBAR_ACCORDION_STORAGE_KEY, JSON.stringify({ collapsed, sizes }));
  } catch {}
}

export const useAccordionStore = create<AccordionState>((set) => {
  const initial = load();
  return {
    ...initial,
    toggle: (id) => {
      const collapsed = {
        ...useAccordionStore.getState().collapsed,
        [id]: !useAccordionStore.getState().collapsed[id],
      };
      persist(collapsed, useAccordionStore.getState().sizes);
      set({ collapsed });
    },
    setSizes: (sizes) => {
      persist(useAccordionStore.getState().collapsed, sizes);
      set({ sizes });
    },
  };
});
