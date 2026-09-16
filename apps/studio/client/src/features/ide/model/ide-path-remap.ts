import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { normalizeWorkspacePath, remapWorkspacePath } from '@/shared/lib/workspace-path';
import type { IdeTab } from './ide.store';
import type { IdeWorkspaceState } from './ide-layout';

export type IdePathRemap = {
  tabs: IdeTab[];
  /** old tab id → new tab id, for groups and active pointers. */
  idByOldId: Map<string, string>;
};

/**
 * Move file tabs onto their new paths. Tab ids are path-derived, so a moved file
 * gets a new id and every group pointer must follow.
 */
export function remapTabPaths(tabs: IdeTab[], moves: WorkspaceMoveItem[]): IdePathRemap {
  const idByOldId = new Map<string, string>();
  const next = tabs.map((tab) => {
    if (tab.kind !== 'file' || !tab.path) {
      return tab;
    }
    const currentPath = normalizeWorkspacePath(tab.path);
    const nextPath = remapWorkspacePath(currentPath, moves);
    if (nextPath === currentPath) {
      return tab;
    }
    const id = `file:${nextPath}`;
    idByOldId.set(tab.id, id);
    return { ...tab, id, path: nextPath };
  });
  return { tabs: next, idByOldId };
}

/** Workspace state after a move, or null when no open file was affected. */
export function remapWorkspacePaths(
  ws: IdeWorkspaceState,
  moves: WorkspaceMoveItem[],
): IdeWorkspaceState | null {
  const { tabs, idByOldId } = remapTabPaths(ws.tabs, moves);
  if (idByOldId.size === 0) {
    return null;
  }
  const remapId = (id: string) => idByOldId.get(id) ?? id;
  return {
    ...ws,
    tabs,
    activeId: ws.activeId ? remapId(ws.activeId) : null,
    groups: ws.groups.map((group) => ({
      ...group,
      tabIds: group.tabIds.map(remapId),
      activeId: group.activeId ? remapId(group.activeId) : null,
    })),
  };
}
