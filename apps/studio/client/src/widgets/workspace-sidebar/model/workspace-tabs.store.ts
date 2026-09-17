import { useMemo } from 'react';
import { create } from 'zustand';
import { useWorkspaces } from '@/entities/workspace';
import { WORKSPACE_TABS_STORAGE_KEY } from '@/shared/config/constants';
import { useStudioLocation } from '@/shared/config/location';

type WorkspaceTabsState = {
  /** Explicitly selected workspace tabs, in selection order. Empty = follow the open workspace. */
  selected: string[];
  /** Single-select: one tab, sections follow it. */
  select: (id: string) => void;
  /** Multi-select (shift/control click): toggle a tab in the selection. */
  toggle: (id: string) => void;
};

function loadSelected(): string[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function persistSelected(selected: string[]): void {
  try {
    localStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(selected));
  } catch {}
}

export const useWorkspaceTabsStore = create<WorkspaceTabsState>((set, get) => ({
  selected: loadSelected(),
  select: (id) => {
    persistSelected([id]);
    set({ selected: [id] });
  },
  toggle: (id) => {
    const current = get().selected;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    persistSelected(next);
    set({ selected: next });
  },
}));

/** Workspaces whose groups the sections show: explicit selection, else the open workspace. */
export function useSelectedWorkspaceIds(): string[] {
  const { workspaceId } = useStudioLocation();
  const selected = useWorkspaceTabsStore((state) => state.selected);
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const known = useMemo(() => new Set(workspaces.map((item) => item.id)), [workspaces]);
  return useMemo(() => {
    const valid = selected.filter((id) => known.has(id));
    if (valid.length > 0) {
      return valid;
    }
    return workspaceId ? [workspaceId] : [];
  }, [selected, known, workspaceId]);
}
