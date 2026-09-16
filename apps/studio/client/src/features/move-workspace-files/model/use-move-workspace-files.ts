import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { moveWorkspaceFiles } from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { toast } from '@/shared/ui/toast';

/**
 * Applies a batch move and pulls every path-keyed consumer onto the new paths:
 * Explorer queries, git decorations, IDE file tabs and open-file state.
 */
export function useMoveWorkspaceFiles(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: WorkspaceMoveItem[]) => moveWorkspaceFiles(workspaceId, items),
    onSuccess: (result) => {
      const moved = result.moved;
      useIdeStore.getState().remapPaths(workspaceId, moved);
      useDeskStore.getState().remapWorkspaceFiles(workspaceId, moved);
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      void qc.invalidateQueries({ queryKey: ['workspace-file-content', workspaceId] });
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
