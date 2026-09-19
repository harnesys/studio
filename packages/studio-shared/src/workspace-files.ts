export type WorkspaceFileEventKind = 'change' | 'create' | 'delete';
export type WorkspaceFileEvent = {
  kind: WorkspaceFileEventKind;
  dir: string;
  name: string;
};
export type WorkspaceMoveItem = {
  from: string;
  to: string;
};
export type WorkspaceMoveResult = {
  moved: WorkspaceMoveItem[];
};
