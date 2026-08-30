import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { gitFileStatusQueryKey, stageGit } from '@/shared/api/git';
import { toast } from '@/shared/ui/toast';
import { useFileSelectionStore } from './file-selection.store';

export function useFilesHotkey(workspaceId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey && event.altKey && event.code === 'KeyA')) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return;
      }
      const store = useFileSelectionStore.getState();
      if (!store.filesActive) {
        return;
      }
      event.preventDefault();
      const paths = store.selectedPaths;
      const target = paths.length > 0 ? paths : [];
      void stageGit(workspaceId, target)
        .then(() => {
          void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
          void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
          void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'status'] });
          toast.add({ title: target.length === 0 ? 'Staged all' : `Staged ${target.length}` });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Stage failed';
          toast.add({ title: 'Stage failed', description: msg });
        });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [workspaceId, qc]);
}
