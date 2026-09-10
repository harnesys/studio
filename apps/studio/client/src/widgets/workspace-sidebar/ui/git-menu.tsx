import type { GitStatusResponse } from '@studio/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DownloadIcon,
  GitCommitVerticalIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { getGitStatus, gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';
import { useFileSelectionStore } from '../model/file-selection.store';
import { useGitActions } from '../model/use-git-actions';
import { BranchRow } from './branch-row';
import { formatCountsShort, GitCounts } from './git-counts';
import { SectionMenu } from './section-menu';

type GitStatus = Extract<GitStatusResponse, { isGit: true }>;

export function useGitStatus(workspaceId: string): GitStatus | null {
  const query = useQuery({
    queryKey: gitStatusQueryKey(workspaceId),
    queryFn: () => getGitStatus(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return query.data?.isGit ? (query.data as GitStatus) : null;
}

export function GitTitle({ workspaceId }: { workspaceId: string }) {
  const status = useGitStatus(workspaceId);
  if (!status) {
    return <>Git</>;
  }
  const label = status.branch ?? status.head?.slice(0, 7) ?? 'HEAD';
  let dirtyBadge: React.ReactNode = null;
  if (status.counts) {
    dirtyBadge = <GitCounts counts={status.counts} />;
  } else if (status.dirty) {
    dirtyBadge = (
      <span className="shrink-0 font-normal text-[10px] text-amber-600 dark:text-amber-500">
        • {status.dirtyCount}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      Git
      <span className="min-w-0 truncate rounded-sm bg-sidebar-accent px-1 font-mono font-normal text-[10px] text-muted-foreground leading-4">
        {label}
      </span>
      {dirtyBadge}
      {status.ahead || status.behind ? (
        <span className="shrink-0 font-normal text-[10px] text-muted-foreground">
          ↑{status.ahead} ↓{status.behind}
        </span>
      ) : null}
    </span>
  );
}

export function GitSectionMenu({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const status = useGitStatus(workspaceId);
  const [filter] = useState('');
  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const {
    checkoutMutation,
    commitMutation,
    pushMutation,
    pullMutation,
    stageMutation,
    handleCommit,
    handlePush,
    handlePull,
    handleAddAll,
    handleAddSelected,
    handleNewBranch,
  } = useGitActions(workspaceId);

  const filteredLocal = useMemo(() => {
    const local = status?.branches?.local ?? [];
    if (!filter.trim()) {
      return local;
    }
    const q = filter.toLowerCase();
    return local.filter((b) => b.name.toLowerCase().includes(q));
  }, [status?.branches?.local, filter]);
  const filteredRecent = useMemo(() => {
    const recent = status?.branches?.recent ?? [];
    if (!filter.trim()) {
      return recent;
    }
    const q = filter.toLowerCase();
    return recent.filter((b) => b.name.toLowerCase().includes(q));
  }, [status?.branches?.recent, filter]);

  if (!status) {
    return null;
  }

  let commitSuffix = '';
  if (status.dirty) {
    commitSuffix = status.counts
      ? ` • ${formatCountsShort(status.counts)}`
      : ` • ${status.dirtyCount}`;
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
    void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
    void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
    void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
  };

  return (
    <SectionMenu label="Git actions" contentClassName="min-w-52">
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={handleCommit}
          disabled={!status.dirty || commitMutation.isPending}
        >
          <GitCommitVerticalIcon className="size-3"/>
          Commit{commitSuffix}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePush} disabled={pushMutation.isPending}>
          <UploadIcon className="size-3"/>
          Push
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePull} disabled={pullMutation.isPending}>
          <DownloadIcon className="size-3"/>
          Update
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={stageMutation.isPending}>
            <PlusIcon className="size-3"/>
            Add
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={handleAddAll} disabled={stageMutation.isPending}>
              All
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleAddSelected(selectedPaths)}
              disabled={selectedPaths.length === 0 || stageMutation.isPending}
            >
              Selected{selectedPaths.length ? ` (${selectedPaths.length})` : ''}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => handleNewBranch()}>
          <PlusIcon className="size-3"/>
          New Branch...
        </DropdownMenuItem>
        <DropdownMenuItem onClick={refresh}>
          <RefreshCwIcon className="size-3"/>
          Refresh
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {/*<div className="px-1 pb-1">*/}
      {/*  <div className="relative">*/}
      {/*    <SearchIcon className="pointer-events-none absolute top-1/2 left-1.5 size-3 -translate-y-1/2 text-muted-foreground" />*/}
      {/*    <Input*/}
      {/*      value={filter}*/}
      {/*      onChange={(e) => setFilter(e.target.value)}*/}
      {/*      placeholder="Filter branches"*/}
      {/*      className="h-6 pl-6 text-xs"*/}
      {/*    />*/}
      {/*  </div>*/}
      {/*</div>*/}
      {filteredRecent.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Recent</DropdownMenuLabel>
            {filteredRecent.map((b) => (
              <BranchRow
                key={`recent-${b.name}`}
                name={b.name}
                current={b.current}
                onCheckout={() => checkoutMutation.mutate(b.name)}
                onNewBranch={() => handleNewBranch(b.name)}
              />
            ))}
          </DropdownMenuGroup>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Local</DropdownMenuLabel>
        {filteredLocal.length === 0 ? (
          <div className="px-2 py-1 text-muted-foreground text-xs">No branches</div>
        ) : (
          filteredLocal.map((b) => (
            <BranchRow
              key={`local-${b.name}`}
              name={b.name}
              current={b.current}
              onCheckout={() => checkoutMutation.mutate(b.name)}
              onNewBranch={() => handleNewBranch(b.name)}
            />
          ))
        )}
      </DropdownMenuGroup>
    </SectionMenu>
  );
}
