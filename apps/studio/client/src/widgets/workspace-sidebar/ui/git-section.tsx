import type { GitStatusResponse } from '@studio/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DownloadIcon,
  GitBranchIcon,
  GitCommitVerticalIcon,
  PlusIcon,
  UploadIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { watchWorkspaceFiles } from '@/shared/api/files';
import {
  getGitFileStatus,
  getGitStatus,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
} from '@/shared/api/git';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/shared/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useFileSelectionStore } from '../model/file-selection.store';
import { useGitActions } from '../model/use-git-actions';
import { BranchRow } from './branch-row';
import { formatCountsShort, GitCounts } from './git-counts';

export function GitSection({ workspaceId }: { workspaceId: string }) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const qc = useQueryClient();
  const [filter] = useState('');

  const statusQuery = useQuery({
    queryKey: gitStatusQueryKey(workspaceId),
    queryFn: () => getGitStatus(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const status = statusQuery.data;

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

  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const {
    checkoutMutation,
    commitMutation,
    pullMutation,
    pushMutation,
    stageMutation,
    handleCommit,
    handleNewBranch,
    handlePull,
    handlePush,
    handleAddAll,
    handleAddSelected,
  } = useGitActions(workspaceId);

  useEffect(() => {
    if (status?.isGit) {
      void qc.prefetchQuery({
        queryKey: gitFileStatusQueryKey(workspaceId),
        queryFn: () => getGitFileStatus(workspaceId),
      });
    }
  }, [status, workspaceId, qc]);

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

  if (!status?.isGit) {
    return (
      <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
        Not a git repository.
      </p>
    );
  }

  // GitStatusResponse is `GitStatusBase & {...}` → discriminant `isGit` не сужается, кастуем к успеху
  const gitStatus = status as Extract<GitStatusResponse, { isGit: true }>;

  let branchLabel: string;
  if (gitStatus.noCommits) {
    branchLabel = `${gitStatus.branch ?? 'HEAD'} (no commits)`;
  } else if (gitStatus.detached) {
    branchLabel = `detached at ${gitStatus.head?.slice(0, 7) ?? 'HEAD'}`;
  } else {
    branchLabel = gitStatus.branch ?? 'HEAD';
  }

  const counts = gitStatus.counts;
  let dirtySuffix = '';
  if (gitStatus.dirty) {
    if (counts) {
      dirtySuffix = ` • ${formatCountsShort(counts)}`;
    } else {
      dirtySuffix = ` • ${gitStatus.dirtyCount} modified`;
    }
  }
  let aheadBehind = '';
  if (gitStatus.ahead || gitStatus.behind) {
    aheadBehind = ` ↑${gitStatus.ahead} ↓${gitStatus.behind}`;
  }

  const display = `${branchLabel}${dirtySuffix}${aheadBehind}`;

  let commitSuffix = '';
  if (gitStatus.dirty) {
    if (counts) {
      commitSuffix = formatCountsShort(counts);
    } else {
      commitSuffix = String(gitStatus.dirtyCount);
    }
  }

  let dirtyBadge: React.ReactNode = null;
  if (gitStatus.dirty) {
    if (counts) {
      dirtyBadge = <GitCounts counts={counts} />;
    } else {
      dirtyBadge = (
        <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-500">
          • {gitStatus.dirtyCount}
        </span>
      );
    }
  }

  if (iconMode) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<SidebarMenuButton tooltip={display} aria-label="Git branch" />}
                  >
                    <GitBranchIcon />
                  </DropdownMenuTrigger>
                  {renderDropdown()}
                </DropdownMenu>
              }
            />
            <TooltipContent side="right">{display}</TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton tooltip={display} aria-label="Git branch" />}
            className="opacity-80"
          >
            <GitBranchIcon />
            <span>{branchLabel}</span>
            {dirtyBadge}
            {gitStatus.ahead || gitStatus.behind ? (
              <span className="text-[10px] text-muted-foreground">
                ↑{gitStatus.ahead} ↓{gitStatus.behind}
              </span>
            ) : null}
          </DropdownMenuTrigger>
          {renderDropdown()}
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );

  function renderDropdown() {
    return (
      <DropdownMenuContent className="min-w-64" align="start" side="bottom">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={handleCommit}
            disabled={!gitStatus.dirty || commitMutation.isPending}
          >
            <GitCommitVerticalIcon />
            Commit{commitSuffix ? ` • ${commitSuffix}` : ''}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePush} disabled={pushMutation.isPending}>
            <UploadIcon />
            Push
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePull} disabled={pullMutation.isPending}>
            <DownloadIcon />
            Update
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={stageMutation.isPending}>
              <PlusIcon />
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
            <PlusIcon />
            New Branch...
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
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
            <DropdownMenuSeparator />
          </>
        ) : null}
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
      </DropdownMenuContent>
    );
  }
}
