import { create } from 'zustand';
import { EXPLORER_SHOW_HIDDEN_STORAGE_KEY } from '@/shared/config/constants';

type ExplorerHiddenState = {
  showHidden: boolean;
  setShowHidden: (show: boolean) => void;
};

function load(): boolean {
  try {
    return localStorage.getItem(EXPLORER_SHOW_HIDDEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useExplorerHiddenStore = create<ExplorerHiddenState>((set) => ({
  showHidden: load(),
  setShowHidden: (showHidden) => {
    try {
      localStorage.setItem(EXPLORER_SHOW_HIDDEN_STORAGE_KEY, showHidden ? '1' : '0');
    } catch {}
    set({ showHidden });
  },
}));
