import { create } from 'zustand';

export type ExplorerCreateDraft = { kind: 'file' | 'dir'; parentPath: string };

type ExplorerDraftState = {
  draft: ExplorerCreateDraft | null;
  start: (kind: 'file' | 'dir', parentPath: string) => void;
  cancel: () => void;
};

export const useExplorerDraftStore = create<ExplorerDraftState>((set) => ({
  draft: null,
  start: (kind, parentPath) => set({ draft: { kind, parentPath } }),
  cancel: () => set({ draft: null }),
}));
