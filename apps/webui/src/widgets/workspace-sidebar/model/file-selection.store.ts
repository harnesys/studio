import { create } from 'zustand';

type FileSelectionState = {
  workspaceId: string | null;
  selectedPaths: string[];
  anchorPath: string | null;
  visiblePaths: string[];
  filesActive: boolean;
};

type FileSelectionStore = FileSelectionState & {
  setWorkspace: (workspaceId: string | null) => void;
  setVisiblePaths: (paths: string[]) => void;
  setFilesActive: (active: boolean) => void;
  selectSingle: (path: string) => void;
  togglePath: (path: string) => void;
  selectRange: (targetPath: string) => void;
  setSelected: (paths: string[]) => void;
  clear: () => void;
};

export const useFileSelectionStore = create<FileSelectionStore>((set, _get) => ({
  workspaceId: null,
  selectedPaths: [],
  anchorPath: null,
  visiblePaths: [],
  filesActive: false,

  setWorkspace: (workspaceId) =>
    set((state) => {
      if (state.workspaceId === workspaceId) {
        return state;
      }
      return {
        workspaceId,
        selectedPaths: [],
        anchorPath: null,
        visiblePaths: [],
        filesActive: false,
      };
    }),

  setVisiblePaths: (paths) => set({ visiblePaths: paths }),

  setFilesActive: (active) => set({ filesActive: active }),

  selectSingle: (path) => set({ selectedPaths: [path], anchorPath: path }),

  togglePath: (path) =>
    set((state) => {
      const exists = state.selectedPaths.includes(path);
      const next = exists
        ? state.selectedPaths.filter((p) => p !== path)
        : [...state.selectedPaths, path];
      return { selectedPaths: next, anchorPath: path };
    }),

  selectRange: (targetPath) =>
    set((state) => {
      const anchor = state.anchorPath;
      if (!anchor) {
        return { selectedPaths: [targetPath], anchorPath: targetPath };
      }
      const visible = state.visiblePaths;
      const aIdx = visible.indexOf(anchor);
      const tIdx = visible.indexOf(targetPath);
      if (aIdx === -1 || tIdx === -1) {
        return { selectedPaths: [targetPath], anchorPath: targetPath };
      }
      const start = Math.min(aIdx, tIdx);
      const end = Math.max(aIdx, tIdx);
      const slice = visible.slice(start, end + 1);
      return { selectedPaths: slice };
    }),

  setSelected: (paths) =>
    set({ selectedPaths: paths, anchorPath: paths[paths.length - 1] ?? null }),

  clear: () => set({ selectedPaths: [], anchorPath: null }),
}));
