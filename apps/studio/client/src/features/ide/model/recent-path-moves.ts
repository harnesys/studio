import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { normalizeWorkspacePath, remapWorkspacePath } from '@/shared/lib/workspace-path';

/** Covers the URL/store sync race after move; short so a recreated path is not redirected. */
const RECENT_MOVES_TTL_MS = 3_000;

/** Last successful move for this workspace; TextEditor/URL sync use it briefly. */
let recent: { workspaceId: string; moves: WorkspaceMoveItem[]; at: number } | null = null;

export function rememberWorkspaceMoves(workspaceId: string, moves: WorkspaceMoveItem[]): void {
  recent = moves.length > 0 ? { workspaceId, moves, at: Date.now() } : null;
}

/** New path after the latest move, or null when `path` was not affected / TTL expired. */
export function remappedPathAfterMove(workspaceId: string, path: string): string | null {
  if (!recent || recent.workspaceId !== workspaceId) {
    return null;
  }
  if (Date.now() - recent.at > RECENT_MOVES_TTL_MS) {
    recent = null;
    return null;
  }
  const current = normalizeWorkspacePath(path);
  const next = remapWorkspacePath(current, recent.moves);
  return next === current ? null : next;
}
