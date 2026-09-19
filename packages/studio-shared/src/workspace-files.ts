export type WorkspaceFileEventKind = 'change' | 'create' | 'delete';

export type WorkspaceFileEvent = {
  kind: WorkspaceFileEventKind;
  dir: string;
  name: string;
};

/** One source → destination pair of a workspace move, paths relative to the root. */
export type WorkspaceMoveItem = {
  from: string;
  to: string;
};

export type WorkspaceMoveResult = {
  /** Items applied exactly as requested. Descendants of moved directories are implied by prefix. */
  moved: WorkspaceMoveItem[];
};
