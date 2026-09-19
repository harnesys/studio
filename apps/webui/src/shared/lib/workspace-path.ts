import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
export function normalizeWorkspacePath(path: string): string {
  return path.replace(/^\/+/, '').replaceAll('\\', '/');
}
export function workspaceDirname(path: string): string {
  const normalized = normalizeWorkspacePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? '' : normalized.slice(0, slash);
}
export function workspaceBasename(path: string): string {
  const normalized = normalizeWorkspacePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}
export function joinWorkspacePath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}
export function isSameOrInsidePath(candidate: string, parent: string): boolean {
  const c = normalizeWorkspacePath(candidate);
  const p = normalizeWorkspacePath(parent);
  return c === p || c.startsWith(`${p}/`);
}
export function remapWorkspacePath(path: string, moves: WorkspaceMoveItem[]): string {
  const normalized = normalizeWorkspacePath(path);
  for (const move of moves) {
    if (isSameOrInsidePath(normalized, move.from)) {
      return move.to + normalized.slice(move.from.length);
    }
  }
  return normalized;
}
export function pathEquals(a: string, b: string): boolean {
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b);
}
