import type { WorkspaceFileEntry } from '@studio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIdeStore } from '@/features/ide';
import { openWorkspaceFile } from '@/features/open-file';
import {
  createWorkspaceFile,
  deleteWorkspaceFile,
  listWorkspaceFiles,
  watchWorkspaceFiles,
} from '@/shared/api/files';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { knowledgeIndexStateQuery } from '@/shared/api/memory';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useSidebar } from '@/shared/ui/sidebar';
import { useFileSelectionStore } from '../model/file-selection.store';
import { useFilesHotkey } from '../model/use-files-hotkey';
import { type CreateDraft, FileRow, InlineCreateInput } from './file-row';
import { RailSection } from './rail-section';

export function FilesSection({
  workspaceId,
  selected,
}: {
  workspaceId: string;
  selected: boolean;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const { openFiles } = useStudioNavigation();
  const { surface } = useStudioLocation();
  const qc = useQueryClient();
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const setWorkspace = useFileSelectionStore((s) => s.setWorkspace);
  const setFilesActive = useFileSelectionStore((s) => s.setFilesActive);
  const selectSingle = useFileSelectionStore((s) => s.selectSingle);
  const togglePath = useFileSelectionStore((s) => s.togglePath);
  const selectRange = useFileSelectionStore((s) => s.selectRange);

  const filesQuery = useQuery({
    queryKey: ['workspace-files', workspaceId],
    queryFn: () => listWorkspaceFiles(workspaceId),
  });

  const gitFileStatusQuery = useQuery({
    queryKey: gitFileStatusQueryKey(workspaceId),
    queryFn: () => getGitFileStatus(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const gitMap = gitFileStatusQuery.data?.map ?? {};
  const gitTruncated = Boolean(gitFileStatusQuery.data?.truncated);

  const indexStateQuery = useQuery({
    ...knowledgeIndexStateQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const isIndexing = indexStateQuery.data?.status === 'running';

  useEffect(() => {
    setWorkspace(workspaceId);
  }, [workspaceId, setWorkspace]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'status'] });
    };
    return watchWorkspaceFiles(workspaceId, invalidate);
  }, [workspaceId, qc]);

  const createMutation = useMutation({
    mutationFn: (input: { path: string; kind: 'file' | 'dir' }) =>
      createWorkspaceFile(workspaceId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'status'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteWorkspaceFile(workspaceId, path),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'status'] });
    },
  });

  const entries = filesQuery.data ?? [];

  const computeVisible = useCallback((): string[] => {
    const out: string[] = [];
    const walk = (ents: WorkspaceFileEntry[], parent: string) => {
      for (const ent of ents) {
        const full = parent ? `${parent}/${ent.name}` : ent.name;
        out.push(full);
        if (ent.kind === 'dir' && expandedDirs.has(full)) {
          const cached = qc.getQueryData<WorkspaceFileEntry[]>([
            'workspace-files',
            workspaceId,
            full,
          ]);
          if (cached) {
            walk(cached, full);
          }
        }
      }
    };
    walk(entries, '');
    return out;
  }, [entries, expandedDirs, qc, workspaceId]);

  // keep visiblePaths in store for shift+click range
  const visibleForStore = useMemo(() => computeVisible(), [computeVisible]);
  const setVisiblePaths = useFileSelectionStore((s) => s.setVisiblePaths);
  useEffect(() => {
    setVisiblePaths(visibleForStore);
  }, [visibleForStore, setVisiblePaths]);

  const handleSelect = useCallback(
    (path: string, event?: React.MouseEvent) => {
      setFilesActive(true);
      const e = event as React.MouseEvent | undefined;
      if (e?.shiftKey) {
        const anchor = useFileSelectionStore.getState().anchorPath;
        if (!anchor) {
          selectSingle(path);
        } else {
          selectRange(path);
        }
        return;
      }
      if (e?.metaKey || e?.ctrlKey) {
        togglePath(path);
        return;
      }
      selectSingle(path);
    },
    [selectSingle, togglePath, selectRange, setFilesActive],
  );

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const startCreate = (kind: 'file' | 'dir', parentPath: string) => {
    setCreateDraft({ kind, parentPath });
  };

  const finishCreate = (name: string) => {
    if (!createDraft || !name.trim()) {
      setCreateDraft(null);
      return;
    }
    const relPath = createDraft.parentPath
      ? `${createDraft.parentPath}/${name.trim()}`
      : name.trim();
    createMutation.mutate({ path: relPath, kind: createDraft.kind });
    if (createDraft.kind === 'file') {
      openWorkspaceFile(workspaceId, relPath);
      useIdeStore.getState().openFile(workspaceId, relPath);
    }
    if (createDraft.kind === 'dir') {
      setExpandedDirs((prev) => new Set(prev).add(createDraft.parentPath));
    }
    setCreateDraft(null);
  };

  const handleDelete = (path: string) => {
    deleteMutation.mutate(path);
    useIdeStore.getState().closeByEntity(workspaceId, 'file', path);
  };

  const handleOpen = (path: string) => {
    openWorkspaceFile(workspaceId, path);
    useIdeStore.getState().openFile(workspaceId, path);
    if (surface !== 'chat' && surface !== 'files') {
      openFiles(workspaceId);
    }
  };

  const handleRefresh = () => {
    void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
  };

  useFilesHotkey(workspaceId);

  const sectionActions = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" title="Files actions" aria-label="Files actions" />
        }
      >
        <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">Files actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => startCreate('file', '')}>
            <FileIcon />
            New file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startCreate('dir', '')}>
            <FolderIcon />
            New folder
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleRefresh}>
            <RefreshCwIcon />
            Refresh
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <RailSection
      id="files"
      icon={<FolderIcon />}
      openIcon={<FolderOpenIcon />}
      title={
        <span className="flex items-center gap-1.5">
          Files
          {isIndexing ? (
            <LoaderCircleIcon
              className="size-3.5 animate-spin text-muted-foreground"
              data-testid="files-indexing"
              aria-label="Indexing"
            />
          ) : null}
        </span>
      }
      actions={iconMode ? undefined : sectionActions}
      testId="nav-files"
      selected={selected}
      onHeaderClick={() => openFiles(workspaceId)}
    >
      <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
        {gitTruncated ? (
          <div className="mx-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 text-xs group-data-[collapsible=icon]:hidden dark:text-amber-400">
            Large repo — file decorations off. Expand a folder for status.
          </div>
        ) : null}
        {createDraft && createDraft.parentPath === '' && (
          <InlineCreateInput kind={createDraft.kind} onFinish={finishCreate} depth={0} />
        )}
        {entries.map((entry) => (
          <FileRow
            key={entry.name}
            entry={entry}
            parentPath=""
            depth={0}
            workspaceId={workspaceId}
            expandedDirs={expandedDirs}
            selectedPaths={selectedPaths}
            createDraft={createDraft}
            iconMode={iconMode}
            gitMap={gitTruncated ? undefined : gitMap}
            gitTruncated={gitTruncated}
            onToggle={toggleDir}
            onSelect={handleSelect}
            onOpen={handleOpen}
            onStartCreate={startCreate}
            onCreateFinish={finishCreate}
            onDelete={handleDelete}
          />
        ))}
        {entries.length === 0 && !filesQuery.isLoading && (
          <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
            Empty workspace.
          </p>
        )}
      </div>
    </RailSection>
  );
}
