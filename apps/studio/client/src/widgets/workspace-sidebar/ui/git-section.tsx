import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useIdeStore } from '@/features/ide';
import { watchWorkspaceFiles } from '@/shared/api/files';
import { getGitFileStatus, gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { gitFileStatusLabel } from './git-file-decorations';
import { useGitStatus } from './git-menu';

export function GitSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const gitStatus = useGitStatus(workspaceId);
  const gitColors = useGitStatusColors((state) => state.colors);

  const fileStatusQuery = useQuery({
    queryKey: gitFileStatusQueryKey(workspaceId),
    queryFn: () => getGitFileStatus(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const unwatch = watchWorkspaceFiles(workspaceId, () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
    });
    return unwatch;
  }, [workspaceId, qc]);

  const map = fileStatusQuery.data?.map ?? {};
  const files = Object.entries(map)
    .filter(([, s]) => s !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (!gitStatus) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        Not a git repository.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
      {fileStatusQuery.data?.truncated ? (
        <div className="mx-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 text-xs dark:text-amber-400">
          Large repo — change list may be incomplete.
        </div>
      ) : null}
      {files.length === 0 && !fileStatusQuery.isPending ? (
        <p className="px-2 py-2 text-muted-foreground text-xs">No changes.</p>
      ) : null}
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          title={file.path}
          onClick={() => {
            useIdeStore.getState().openDiff(workspaceId, file.path);
          }}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-sidebar-accent/70"
        >
          <span
            className={cn(
              'w-3 shrink-0 text-center font-mono text-[10px] uppercase',
              gitStatusColorClass(file.status),
            )}
            style={{ color: gitColors[file.status] }}
          >
            {gitFileStatusLabel(file.status)}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{file.path}</span>
        </button>
      ))}
    </div>
  );
}
