import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import {
  isSameOrInsidePath,
  joinWorkspacePath,
  normalizeWorkspacePath,
  workspaceBasename,
  workspaceDirname,
} from '@/shared/lib/workspace-path';

/** Windows reserved characters plus path separators; the server re-validates. */
const INVALID_NAME_RE = /[/\\:*?"<>|\0]/;

export function isValidFileName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 && trimmed !== '.' && trimmed !== '..' && !INVALID_NAME_RE.test(trimmed)
  );
}

/** Selecting a directory selects its subtree; those descendants travel with the parent. */
export function collapseToRoots(paths: string[]): string[] {
  const unique = [...new Set(paths.map(normalizeWorkspacePath))];
  return unique.filter(
    (path) => !unique.some((other) => other !== path && isSameOrInsidePath(path, other)),
  );
}

/** A directory cannot be dropped into itself or into its own subtree. */
export function canDropInto(paths: string[], targetDir: string): boolean {
  const target = normalizeWorkspacePath(targetDir);
  return paths.every((path) => !isSameOrInsidePath(target, path));
}

export function buildMoveItems(paths: string[], targetDir: string): WorkspaceMoveItem[] {
  return collapseToRoots(paths)
    .map((from) => ({ from, to: joinWorkspacePath(targetDir, workspaceBasename(from)) }))
    .filter((item) => item.from !== item.to);
}

export function buildRenameItem(path: string, newName: string): WorkspaceMoveItem {
  const from = normalizeWorkspacePath(path);
  return { from, to: joinWorkspacePath(workspaceDirname(from), newName.trim()) };
}
