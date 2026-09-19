import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useDeskStore } from '@/features/desk';
import { rememberWorkspaceMoves, useIdeStore } from '@/features/ide';
import { moveWorkspaceFiles, workspaceFilesTreeQueryKey } from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { studioPath } from '@/shared/config/routes';
import { normalizeWorkspacePath, remapWorkspacePath } from '@/shared/lib/workspace-path';
import { toast } from '@/shared/ui/toast';

function migrateFileContentQueries(
  qc: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  moves: WorkspaceMoveItem[],
): void {
  const entries = qc.getQueriesData<string>({ queryKey: ['workspace-file-content', workspaceId] });
  for (const [key, data] of entries) {
    const path = key[2];
    if (typeof path !== 'string' || data === undefined) {
      continue;
    }
    const current = normalizeWorkspacePath(path);
    const next = remapWorkspacePath(current, moves);
    if (next === current) {
      continue;
    }
    qc.setQueryData(['workspace-file-content', workspaceId, next], data);
    qc.removeQueries({ queryKey: key, exact: true });
  }
}

function navigateIfFocusMoved(
  navigate: ReturnType<typeof useNavigate>,
  pathname: string,
  workspaceId: string,
  moves: WorkspaceMoveItem[],
): void {
  const filePrefix = `/${workspaceId}/file/`;
  const diffPrefix = `/${workspaceId}/diff/`;
  let kind: 'file' | 'diff' | null = null;
  if (pathname.startsWith(filePrefix)) {
    kind = 'file';
  } else if (pathname.startsWith(diffPrefix)) {
    kind = 'diff';
  }
  if (!kind) {
    return;
  }
  const prefix = kind === 'file' ? filePrefix : diffPrefix;
  const current = normalizeWorkspacePath(decodeURIComponent(pathname.slice(prefix.length)));
  const next = remapWorkspacePath(current, moves);
  if (next === current) {
    return;
  }
  const to =
    kind === 'file' ? studioPath.file(workspaceId, next) : studioPath.diff(workspaceId, next);
  void navigate(to, { replace: true });
}

/**
 * Applies a batch move and pulls every path-keyed consumer onto the new paths:
 * Explorer queries, git decorations, IDE file tabs, URL focus, and open-file state.
 */
export function useMoveWorkspaceFiles(workspaceId: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  return useMutation({
    mutationFn: (items: WorkspaceMoveItem[]) => moveWorkspaceFiles(workspaceId, items),
    onSuccess: (result) => {
      const moved = result.moved;
      rememberWorkspaceMoves(workspaceId, moved);
      useIdeStore.getState().remapPaths(workspaceId, moved);
      useDeskStore.getState().remapWorkspaceFiles(workspaceId, moved);
      migrateFileContentQueries(qc, workspaceId, moved);
      navigateIfFocusMoved(navigate, location.pathname, workspaceId, moved);
      void qc.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
    },
    onError: (err: unknown) => {
      toast.add({
        title: 'Move failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
}
