import { useMemo } from 'react';
import { create } from 'zustand';
import { useWorkspaces } from '@/entities/workspace';
import {
  schedulePersistDeskChrome,
  setDeskSelectionReader,
  setDeskSelectionWriter,
} from './desk-chrome';

type WorkspaceTabsState = {
  selected: string[];
  toggle: (id: string) => void;
  add: (id: string) => void;
};
export const useWorkspaceTabsStore = create<WorkspaceTabsState>((set, get) => ({
  selected: [],
  toggle: (id) => {
    const current = get().selected;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    set({ selected: next });
    schedulePersistDeskChrome();
  },
  add: (id) => {
    const current = get().selected;
    if (current.includes(id)) {
      return;
    }
    const next = [...current, id];
    set({ selected: next });
    schedulePersistDeskChrome();
  },
}));
setDeskSelectionReader(() => useWorkspaceTabsStore.getState().selected);
setDeskSelectionWriter((selectedNodeIds) => {
  useWorkspaceTabsStore.setState({ selected: selectedNodeIds });
});
export function useSelectedWorkspaceIds(): string[] {
  const selected = useWorkspaceTabsStore((state) => state.selected);
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];
  const known = useMemo(() => new Set(workspaces.map((item) => item.id)), [workspaces]);
  return useMemo(() => selected.filter((id) => known.has(id)), [selected, known]);
}
export function seedWorkspaceSelection(workspaceId: string): void {
  const selected = useWorkspaceTabsStore.getState().selected;
  if (selected.length === 0) {
    useWorkspaceTabsStore.getState().add(workspaceId);
  }
}
