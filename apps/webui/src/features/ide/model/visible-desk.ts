import { useSelectedWorkspaceIds } from '@/features/desk';
import { type IdeTab, useIdeStore, type VisibleDesk } from './ide.store';
export function useVisibleDesk(): VisibleDesk {
  const ids = useSelectedWorkspaceIds();
  const byWorkspace = useIdeStore((s) => s.byWorkspace);
  const tabs = ids.flatMap((id) => byWorkspace[id]?.tabs ?? []);
  const activeId = ids.map((id) => byWorkspace[id]?.activeId).find((id) => id) ?? null;
  return { tabs, activeId };
}
export function visibleDeskActiveTab(desk: VisibleDesk): IdeTab | null {
  return desk.tabs.find((tab) => tab.id === desk.activeId) ?? null;
}
