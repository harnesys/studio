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

function isValidSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sanitizeSizes(input: Record<string, number> | undefined): Record<string, number> {
  const next = { ...DEFAULT_SIZES };
  if (!input) {
    return next;
  }
  for (const key of Object.keys(next)) {
    if (isValidSize(input[key])) {
      next[key] = input[key];
    }
  }
  return next;
}

/**
 * Shares of free sidebar height between currently expanded sections.
 * Normalized to sum 1, so layout never depends on absolute stored magnitudes.
 */
export function normalizeShares(
  expanded: string[],
  sizes: Record<string, number>,
): Record<string, number> {
  if (expanded.length === 0) {
    return {};
  }
  const weights = expanded.map((id) => (isValidSize(sizes[id]) ? (sizes[id] as number) : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0) {
    const equal = 1 / expanded.length;
    return Object.fromEntries(expanded.map((id) => [id, equal]));
  }
  return Object.fromEntries(expanded.map((id, index) => [id, weights[index] / total]));
}

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
        sizes: sanitizeSizes(parsed.sizes),
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
      const state = useAccordionStore.getState();
      const expanding = state.collapsed[id] ?? false;
      const collapsed = { ...state.collapsed, [id]: !state.collapsed[id] };
      let sizes = state.sizes;
      if (expanding && !isValidSize(sizes[id])) {
        const others = Object.keys(DEFAULT_SIZES).filter(
          (key) => key !== id && !(collapsed[key] ?? false) && isValidSize(sizes[key]),
        );
        const average =
          others.length > 0
            ? others.reduce((sum, key) => sum + (sizes[key] as number), 0) / others.length
            : 1;
        sizes = { ...sizes, [id]: average };
      }
      persist(collapsed, sizes);
      set({ collapsed, sizes });
    },
    setSizes: (sizes) => {
      const current = useAccordionStore.getState().sizes;
      const next = { ...current };
      for (const [key, value] of Object.entries(sizes)) {
        if (isValidSize(value)) {
          next[key] = value;
        }
      }
      persist(useAccordionStore.getState().collapsed, next);
      set({ sizes: next });
    },
  };
});
