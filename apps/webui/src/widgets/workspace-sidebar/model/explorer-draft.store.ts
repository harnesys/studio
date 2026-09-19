import { create } from 'zustand';
export type ExplorerCreateDraft = {
  kind: 'file' | 'dir';
  parentPath: string;
  workspaceId: string;
};
type ExplorerDraftState = {
  draft: ExplorerCreateDraft | null;
  start: (kind: 'file' | 'dir', parentPath: string, workspaceId: string) => void;
  cancel: () => void;
};
export const useExplorerDraftStore = create<ExplorerDraftState>((set) => ({
  draft: null,
  start: (kind, parentPath, workspaceId) => set({ draft: { kind, parentPath, workspaceId } }),
  cancel: () => set({ draft: null }),
}));
