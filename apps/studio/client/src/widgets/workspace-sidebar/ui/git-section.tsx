import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspaces } from '@/entities/workspace';
import { useIdeStore } from '@/features/ide';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { studioPath } from '@/shared/config/routes';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { gitFileStatusLabel } from './git-file-decorations';
import { useGitStatus } from './git-menu';
import { WorkspaceGroupLabel } from './workspace-group';

export function GitSection({
  workspaceIds,
  groupActions,
}: {
  workspaceIds: string[];
  groupActions?: (workspaceId: string) => ReactNode;
}) {
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];

  if (workspaceIds.length === 0) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        No workspace selected.
      </p>
    );
  }

  const multi = workspaceIds.length > 1;

  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
      {workspaceIds.map((id) => {
        const workspace = workspaces.find((item) => item.id === id);
        if (!workspace) {
          return null;
        }
        return (
          <GitWorkspaceGroup
            key={id}
            workspaceId={id}
            workspaceName={workspace.name}
            showHeader={multi}
            actions={multi ? groupActions?.(id) : undefined}
          />
        );
      })}
    </div>
  );
}

function GitWorkspaceGroup({
  workspaceId,
  workspaceName,
  showHeader,
  actions,
}: {
  workspaceId: string;
  workspaceName: string;
  showHeader: boolean;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
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

  const map = fileStatusQuery.data?.map ?? {};
  const files = Object.entries(map)
    .filter(([, s]) => s !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const branchLabel = gitStatus
    ? (gitStatus.branch ?? gitStatus.head?.slice(0, 7) ?? 'HEAD')
    : null;

  return (
    <div data-testid={`git-workspace-${workspaceId}`}>
      {showHeader ? <WorkspaceGroupLabel name={workspaceName} visible actions={actions} /> : null}
      {showHeader &&
      (branchLabel || gitStatus?.dirty || (gitStatus && (gitStatus.ahead || gitStatus.behind))) ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-0.5 text-[10px] text-muted-foreground">
          {branchLabel ? (
            <span className="rounded-sm bg-sidebar-accent px-1 font-mono font-normal normal-case leading-4 tracking-normal">
              {branchLabel}
            </span>
          ) : null}
          {gitStatus?.dirty ? (
            <span className="font-normal text-amber-600 normal-case tracking-normal dark:text-amber-500">
              • {gitStatus.dirtyCount}
            </span>
          ) : null}
          {gitStatus && (gitStatus.ahead || gitStatus.behind) ? (
            <span className="font-normal normal-case tracking-normal">
              ↑{gitStatus.ahead} ↓{gitStatus.behind}
            </span>
          ) : null}
        </div>
      ) : null}
      {!gitStatus ? (
        <p className="px-2 py-2 text-muted-foreground text-xs">Not a git repository.</p>
      ) : (
        <>
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
                void navigate(studioPath.diff(workspaceId, file.path));
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
        </>
      )}
    </div>
  );
}
