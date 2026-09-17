import { useMutation, useQueryClient } from '@tanstack/react-query';

import { openNewBranchDialog } from '@/features/git-branch';
import { openCommitDialog } from '@/features/git-commit';
import { workspaceFilesTreeQueryKey } from '@/shared/api/files';
import {
  checkoutGitBranch,
  commitGit,
  createGitBranch,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
  pullGit,
  pushGit,
  stageGit,
} from '@/shared/api/git';
import { toast } from '@/shared/ui/toast';

export function useGitActions(workspaceId: string) {
  const qc = useQueryClient();

  const checkoutMutation = useMutation({
    mutationFn: (branch: string) => checkoutGitBranch(workspaceId, branch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      toast.add({ title: 'Checkout failed', description: msg });
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; checkout: boolean; from?: string }) =>
      createGitBranch(workspaceId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Create branch failed';
      toast.add({ title: 'Create branch failed', description: msg });
    },
  });

  const commitMutation = useMutation({
    mutationFn: (message: string) => commitGit(workspaceId, message),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      toast.add({ title: 'Committed' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Commit failed';
      toast.add({ title: 'Commit failed', description: msg });
    },
  });

  const pushMutation = useMutation({
    mutationFn: () => pushGit(workspaceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      toast.add({ title: 'Pushed' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Push failed';
      toast.add({ title: 'Push failed', description: msg });
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => pullGit(workspaceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      toast.add({ title: 'Updated' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast.add({ title: 'Update failed', description: msg });
    },
  });

  const stageMutation = useMutation({
    mutationFn: (paths: string[]) => stageGit(workspaceId, paths),
    onSuccess: (_data, paths) => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      const title = paths.length === 0 ? 'Staged all' : `Staged ${paths.length}`;
      toast.add({ title });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Stage failed';
      toast.add({ title: 'Stage failed', description: msg });
    },
  });

  const handleNewBranch = (from?: string) => {
    void openNewBranchDialog(from).then((result) => {
      if (!result) {
        return;
      }
      createMutation.mutate({ name: result.name, checkout: result.checkout, from });
    });
  };

  const handleCommit = () => {
    void openCommitDialog(workspaceId).then((result) => {
      if (!result) {
        return;
      }
      const pushAfter = Boolean((result as { push?: boolean }).push);
      if (!pushAfter) {
        commitMutation.mutate(result.message);
        return;
      }
      commitMutation.mutate(result.message, {
        onSuccess: () => {
          pushMutation.mutate();
        },
      });
    });
  };

  const handlePush = () => {
    pushMutation.mutate();
  };

  const handlePull = () => {
    pullMutation.mutate();
  };

  const handleAddAll = () => {
    stageMutation.mutate([]);
  };

  const handleAddSelected = (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }
    stageMutation.mutate(paths);
  };

  return {
    checkoutMutation,
    createMutation,
    commitMutation,
    pushMutation,
    pullMutation,
    stageMutation,
    handleNewBranch,
    handleCommit,
    handlePush,
    handlePull,
    handleAddAll,
    handleAddSelected,
  };
}
