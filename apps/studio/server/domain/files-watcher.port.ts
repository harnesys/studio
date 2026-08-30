import type { WorkspaceFileEntry, WorkspaceFileEvent } from '../../shared/types.ts';

export type FilesWatcherInput = {
  watch(
    workspaceId: string,
    workspacePath: string,
    onEvent: (event: WorkspaceFileEvent) => void,
  ): () => void;
  listTree(workspacePath: string): Promise<WorkspaceFileEntry[]>;
};

export type FilesWatcherPort = FilesWatcherInput;
