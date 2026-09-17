import { useMemo } from 'react';
import { create } from 'zustand';
import { useWorkspaces } from '@/entities/workspace';
import { WORKSPACE_TABS_STORAGE_KEY } from '@/shared/config/constants';

type WorkspaceTabsState = {
  selected: string[];
  toggle: (id: string) => void;
  add: (id: string) => void;
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
  toggle: (id) => {
    const current = get().selected;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    persistSelected(next);
    set({ selected: next });
  },
  add: (id) => {
    const current = get().selected;
    if (current.includes(id)) {
      return;
    }
    const next = [...current, id];
    persistSelected(next);
    set({ selected: next });
  },
}));

/** Workspaces whose groups the sections show. Empty selection = empty groups. */
export function useSelectedWorkspaceIds(): string[] {
  const selected = useWorkspaceTabsStore((state) => state.selected);
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const known = useMemo(() => new Set(workspaces.map((item) => item.id)), [workspaces]);
  return useMemo(() => selected.filter((id) => known.has(id)), [selected, known]);
}

/** One-shot seed when LS is empty and URL has a workspace. Not a live fallback. */
export function seedWorkspaceSelection(workspaceId: string): void {
  const selected = useWorkspaceTabsStore.getState().selected;
  if (selected.length === 0) {
    useWorkspaceTabsStore.getState().add(workspaceId);
  }
}
