import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { remapWorkspacePath } from '@/shared/lib/workspace-path';
import type { WorkspaceOpenFiles } from './desk.store';
export function remapWorkspaceOpenFiles(
  files: WorkspaceOpenFiles,
  moves: WorkspaceMoveItem[],
): WorkspaceOpenFiles {
  let changed = false;
  const tabs = files.tabs.map((tab) => {
    const nextPath = remapWorkspacePath(tab.path, moves);
    if (nextPath === tab.path) {
      return tab;
    }
    changed = true;
    return { ...tab, path: nextPath };
  });
  if (!changed) {
    return files;
  }
  const activePath = files.activePath ? remapWorkspacePath(files.activePath, moves) : null;
  return { tabs, activePath };
}
