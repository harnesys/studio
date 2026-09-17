import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIdeStore } from '@/features/ide';
import {
  buildMoveItems,
  buildRenameItem,
  canDropInto,
  isValidFileName,
  moveDrag,
  setMoveDrag,
  useMoveWorkspaceFiles,
} from '@/features/move-workspace-files';
import { openWorkspaceFile } from '@/features/open-file';
import {
  createWorkspaceFile,
  deleteWorkspaceFile,
  listWorkspaceFilesTree,
  workspaceFilesTreeQueryKey,
} from '@/shared/api/files';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { useStudioNavigation } from '@/shared/config/navigation';
import { useSidebar } from '@/shared/ui/sidebar';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { useFileSelectionStore } from '../model/file-selection.store';
import { childrenOf, indexFileTree } from '../model/file-tree-index';
import { useFilesHotkey } from '../model/use-files-hotkey';
import { FileRow, InlineCreateInput } from './file-row';

export function ExplorerContent({
  workspaceId,
  depthOffset = 0,
}: {
  workspaceId: string;
  depthOffset?: number;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const { openFile } = useStudioNavigation();
  const qc = useQueryClient();
  const draft = useExplorerDraftStore((store) => store.draft);
  const createDraft = draft?.workspaceId === workspaceId ? draft : null;
  const startCreate = useExplorerDraftStore((store) => store.start);
  const cancelCreate = useExplorerDraftStore((store) => store.cancel);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const moveMutation = useMoveWorkspaceFiles(workspaceId);
  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const selectionWorkspaceId = useFileSelectionStore((s) => s.workspaceId);
  const setWorkspace = useFileSelectionStore((s) => s.setWorkspace);
  const setFilesActive = useFileSelectionStore((s) => s.setFilesActive);
  const selectSingle = useFileSelectionStore((s) => s.selectSingle);
  const togglePath = useFileSelectionStore((s) => s.togglePath);
  const selectRange = useFileSelectionStore((s) => s.selectRange);
  const activeSelectedPaths = selectionWorkspaceId === workspaceId ? selectedPaths : [];

  const treeQuery = useQuery({
    queryKey: workspaceFilesTreeQueryKey(workspaceId),
    queryFn: () => listWorkspaceFilesTree(workspaceId),
    staleTime: 60_000,
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

  const invalidateTree = () => {
    void qc.invalidateQueries({ queryKey: workspaceFilesTreeQueryKey(workspaceId) });
    void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
    void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'status'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { path: string; kind: 'file' | 'dir' }) =>
      createWorkspaceFile(workspaceId, input),
    onSuccess: invalidateTree,
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteWorkspaceFile(workspaceId, path),
    onSuccess: invalidateTree,
  });

  const showHidden = useExplorerHiddenStore((store) => store.showHidden);
  const treeIndex = useMemo(() => indexFileTree(treeQuery.data ?? []), [treeQuery.data]);
  const entries = childrenOf(treeIndex, '', showHidden);

  const computeVisible = useCallback((): string[] => {
    const out: string[] = [];
    const walk = (parent: string) => {
      for (const ent of childrenOf(treeIndex, parent, showHidden)) {
        out.push(ent.path);
        if (ent.kind === 'dir' && expandedDirs.has(ent.path)) {
          walk(ent.path);
        }
      }
    };
    walk('');
    return out;
  }, [treeIndex, expandedDirs, showHidden]);

  const visibleForStore = computeVisible();
  const setVisiblePaths = useFileSelectionStore((s) => s.setVisiblePaths);
  useEffect(() => {
    if (selectionWorkspaceId === workspaceId) {
      setVisiblePaths(visibleForStore);
    }
  }, [visibleForStore, setVisiblePaths, selectionWorkspaceId, workspaceId]);

  const activateWorkspace = useCallback(() => {
    if (useFileSelectionStore.getState().workspaceId !== workspaceId) {
      setWorkspace(workspaceId);
    }
  }, [setWorkspace, workspaceId]);

  const handleSelect = useCallback(
    (path: string, event?: React.MouseEvent) => {
      activateWorkspace();
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
    [activateWorkspace, selectSingle, togglePath, selectRange, setFilesActive],
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

  const finishCreate = (name: string) => {
    if (!createDraft || !name.trim()) {
      cancelCreate();
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
    cancelCreate();
  };

  const handleDelete = (path: string) => {
    deleteMutation.mutate(path);
    useIdeStore.getState().closeByEntity(workspaceId, 'file', path);
  };

  const move = (items: WorkspaceMoveItem[], expandTarget?: string) => {
    if (items.length === 0) {
      return;
    }
    moveMutation.mutate(items, {
      onSuccess: () => {
        if (expandTarget) {
          setExpandedDirs((prev) => new Set(prev).add(expandTarget));
        }
      },
    });
  };

  const handleMoveInto = (targetDir: string, paths: string[]) => {
    move(buildMoveItems(paths, targetDir), targetDir);
  };

  const handleRenameFinish = (path: string, name: string) => {
    setRenamePath(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === path.split('/').pop()) {
      return;
    }
    if (!isValidFileName(trimmed)) {
      toast.add({ title: 'Invalid file name', description: trimmed });
      return;
    }
    move([buildRenameItem(path, trimmed)]);
  };

  const handleRootDrop = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || drag.workspaceId !== workspaceId) {
      return;
    }
    if ((event.target as Element | null)?.closest?.('[data-path]')) {
      return;
    }
    const items = buildMoveItems(drag.paths, '');
    if (items.length === 0 || !canDropInto(drag.paths, '')) {
      return;
    }
    event.preventDefault();
    setMoveDrag(null);
    move(items);
  };

  const handleRootDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || drag.workspaceId !== workspaceId) {
      return;
    }
    if ((event.target as Element | null)?.closest?.('[data-path]')) {
      return;
    }
    if (!canDropInto(drag.paths, '') || buildMoveItems(drag.paths, '').length === 0) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleOpen = (path: string) => {
    activateWorkspace();
    openWorkspaceFile(workspaceId, path);
    useIdeStore.getState().openFile(workspaceId, path);
    openFile(workspaceId, path);
  };

  useFilesHotkey(selectionWorkspaceId === workspaceId ? workspaceId : '');

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: explorer root is a drop target for moves to the workspace root
    <div
      className="flex min-h-full flex-col gap-0.5 group-data-[collapsible=icon]:items-center"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      data-testid={`explorer-content-${workspaceId}`}
    >
      {gitTruncated ? (
        <div className="mx-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 text-xs group-data-[collapsible=icon]:hidden dark:text-amber-400">
          Large repo — file decorations off. Expand a folder for status.
        </div>
      ) : null}
      {treeQuery.isPending ? (
        <div className="flex items-center gap-1.5 px-2 py-2 text-muted-foreground group-data-[collapsible=icon]:hidden">
          <Spinner className="size-3" />
          <span className="text-xs">Loading tree…</span>
        </div>
      ) : null}
      {createDraft && createDraft.parentPath === '' ? (
        <InlineCreateInput kind={createDraft.kind} onFinish={finishCreate} depth={depthOffset} />
      ) : null}
      {entries.map((entry) => (
        <FileRow
          key={entry.name}
          entry={entry}
          parentPath=""
          depth={depthOffset}
          workspaceId={workspaceId}
          expandedDirs={expandedDirs}
          selectedPaths={activeSelectedPaths}
          createDraft={createDraft}
          renamePath={renamePath}
          iconMode={iconMode}
          gitMap={gitTruncated ? undefined : gitMap}
          gitTruncated={gitTruncated}
          treeIndex={treeIndex}
          showHidden={showHidden}
          onToggle={toggleDir}
          onSelect={handleSelect}
          onOpen={handleOpen}
          onStartCreate={(kind, parentPath) => startCreate(kind, parentPath, workspaceId)}
          onCreateFinish={finishCreate}
          onStartRename={setRenamePath}
          onRenameFinish={handleRenameFinish}
          onMoveInto={handleMoveInto}
          onDelete={handleDelete}
        />
      ))}
      {!treeQuery.isPending && entries.length === 0 ? (
        <p
          className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden"
          style={{ paddingLeft: `${8 + depthOffset * 12}px` }}
        >
          Empty workspace.
        </p>
      ) : null}
    </div>
  );
}
