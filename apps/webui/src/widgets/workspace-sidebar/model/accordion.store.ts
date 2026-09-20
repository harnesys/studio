import { create } from 'zustand';
import { SIDEBAR_ACCORDION_STORAGE_KEY } from '@/shared/config/constants';
export type AccordionState = {
  collapsed: Record<string, boolean>;
  sizes: Record<string, number>;
  order: string[];
  hidden: Record<string, boolean>;
  toggle: (id: string) => void;
  setSizes: (sizes: Record<string, number>) => void;
  setOrder: (order: string[]) => void;
  setVisibility: (id: string, visible: boolean) => void;
};
const DEFAULT_SIZES: Record<string, number> = {
  inbox: 1,
  agents: 1,
  explorer: 1,
  automations: 1,
  git: 1,
  terminal: 1,
};
const DEFAULT_COLLAPSED: Record<string, boolean> = {
  inbox: false,
  agents: false,
  explorer: true,
  automations: true,
  git: true,
  terminal: true,
};
const DEFAULT_ORDER: string[] = ['agents', 'explorer', 'automations', 'git', 'terminal'];
const ALL_SECTION_IDS: string[] = ['inbox', ...DEFAULT_ORDER];
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
function sanitizeOrder(input: string[] | undefined): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of input ?? []) {
    if (DEFAULT_ORDER.includes(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  return next;
}
function sanitizeHidden(input: Record<string, boolean> | undefined): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const id of ALL_SECTION_IDS) {
    next[id] = Boolean(input?.[id]);
  }
  return next;
}
function load(): {
  collapsed: Record<string, boolean>;
  sizes: Record<string, number>;
  order: string[];
  hidden: Record<string, boolean>;
} {
  try {
    const raw = localStorage.getItem(SIDEBAR_ACCORDION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        collapsed?: Record<string, boolean>;
        sizes?: Record<string, number>;
        order?: string[];
        hidden?: Record<string, boolean>;
      };
      return {
        collapsed: { ...DEFAULT_COLLAPSED, ...parsed.collapsed },
        sizes: sanitizeSizes(parsed.sizes),
        order: sanitizeOrder(parsed.order),
        hidden: sanitizeHidden(parsed.hidden),
      };
    }
  } catch {}
  return {
    collapsed: { ...DEFAULT_COLLAPSED },
    sizes: { ...DEFAULT_SIZES },
    order: [...DEFAULT_ORDER],
    hidden: sanitizeHidden(undefined),
  };
}
function persist(state: {
  collapsed: Record<string, boolean>;
  sizes: Record<string, number>;
  order: string[];
  hidden: Record<string, boolean>;
}): void {
  try {
    localStorage.setItem(SIDEBAR_ACCORDION_STORAGE_KEY, JSON.stringify(state));
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
      persist({ collapsed, sizes, order: state.order, hidden: state.hidden });
      set({ collapsed, sizes });
    },
    setSizes: (sizes) => {
      const state = useAccordionStore.getState();
      const next = { ...state.sizes };
      for (const [key, value] of Object.entries(sizes)) {
        if (isValidSize(value)) {
          next[key] = value;
        }
      }
      persist({
        collapsed: state.collapsed,
        sizes: next,
        order: state.order,
        hidden: state.hidden,
      });
      set({ sizes: next });
    },
    setOrder: (order) => {
      const state = useAccordionStore.getState();
      const next = sanitizeOrder(order);
      persist({
        collapsed: state.collapsed,
        sizes: state.sizes,
        order: next,
        hidden: state.hidden,
      });
      set({ order: next });
    },
    setVisibility: (id, visible) => {
      const state = useAccordionStore.getState();
      if (!ALL_SECTION_IDS.includes(id)) {
        return;
      }
      const hidden = { ...state.hidden, [id]: !visible };
      persist({ collapsed: state.collapsed, sizes: state.sizes, order: state.order, hidden });
      set({ hidden });
    },
  };
});
