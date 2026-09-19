import type { WorkspaceFileEntry } from '@harnesys/studio-shared';

/** Parent path of a workspace-relative entry path (`''` for root). */
export function parentDir(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** Group flat tree entries by parent directory path. */
export function indexFileTree(entries: WorkspaceFileEntry[]): Map<string, WorkspaceFileEntry[]> {
  const map = new Map<string, WorkspaceFileEntry[]>();
  for (const entry of entries) {
    const parent = parentDir(entry.path);
    const list = map.get(parent);
    if (list) {
      list.push(entry);
    } else {
      map.set(parent, [entry]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  return map;
}

export function childrenOf(
  index: Map<string, WorkspaceFileEntry[]>,
  parentPath: string,
  showHidden: boolean,
): WorkspaceFileEntry[] {
  const list = index.get(parentPath) ?? [];
  if (showHidden) {
    return list;
  }
  return list.filter((entry) => !entry.name.startsWith('.'));
}
