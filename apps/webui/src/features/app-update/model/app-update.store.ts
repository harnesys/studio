import type { Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';
import {
  desktopVersion,
  fetchUpdate,
  installUpdate,
  readAutoUpdatePreference,
  relaunchApp,
  stopHost,
  writeAutoUpdatePreference,
} from './app-update';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error';

type AppUpdateState = {
  status: AppUpdateStatus;
  currentVersion: string | null;
  availableVersion: string | null;
  notes: string | null;
  progress: number | null;
  error: string | null;
  autoUpdate: boolean;
  pending: Update | null;
  loadVersion: () => Promise<void>;
  checkNow: () => Promise<boolean>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
  setAutoUpdate: (enabled: boolean) => void;
};

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  notes: null,
  progress: null,
  error: null,
  autoUpdate: readAutoUpdatePreference(),
  pending: null,
  loadVersion: async () => {
    if (get().currentVersion) {
      return;
    }
    set({ currentVersion: await desktopVersion() });
  },
  checkNow: async () => {
    set({ status: 'checking', error: null });
    try {
      const update = await fetchUpdate();
      if (!update) {
        set({ status: 'up-to-date', pending: null, availableVersion: null, notes: null });
        return false;
      }
      set({
        status: 'available',
        pending: update,
        availableVersion: update.version,
        notes: update.body ?? null,
        progress: null,
      });
      return true;
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
      return false;
    }
  },
  download: async () => {
    const update = get().pending;
    if (!update || get().status === 'downloading') {
      return;
    }
    set({ status: 'downloading', progress: 0, error: null });
    try {
      await stopHost();
      await installUpdate(update, (downloaded, total) => {
        set({ progress: total ? downloaded / total : null });
      });
      set({ status: 'ready', progress: 1 });
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
    }
  },
  restart: async () => {
    await relaunchApp();
  },
  setAutoUpdate: (enabled) => {
    writeAutoUpdatePreference(enabled);
    set({ autoUpdate: enabled });
  },
}));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
