import type { GitFileStatus } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GitStatusColors = Record<GitFileStatus, string>;

/** Дефолты взяты из палитры IDE-статусов; значения нормализованы в нижний регистр. */
export const DEFAULT_GIT_STATUS_COLORS: GitStatusColors = {
  conflicted: '#d5756c',
  modified: '#6997bb',
  staged: '#629755',
  added: '#629755',
  renamed: '#3a8484',
  deleted: '#6c6c6c',
  untracked: '#d1665a',
  ignored: '#838505',
};

export type GitStatusSettingsRow = {
  label: string;
  hex: string;
  /** Пусто, если статус пока не поддерживается моделью (Coming soon). */
  status?: GitFileStatus;
};

/** Таблица для настроек: все IDE-статусы, поддерживаемые — редактируемы. */
export const GIT_STATUS_SETTINGS_ROWS: GitStatusSettingsRow[] = [
  { label: 'Added', hex: '#629755', status: 'added' },
  { label: 'Added in not active changelist', hex: '#629755' },
  { label: 'Changelist conflict', hex: '#d5756c', status: 'conflicted' },
  { label: 'Copied', hex: '#629755' },
  { label: 'Deleted', hex: '#6c6c6c', status: 'deleted' },
  { label: 'Deleted from file system', hex: '#6c6c6c' },
  { label: 'Have changed descendants', hex: '#6997bb' },
  { label: 'Have immediate changed children', hex: '#6997bb' },
  { label: 'Hijacked', hex: '#d1d3d9' },
  { label: 'Ignored', hex: '#838505', status: 'ignored' },
  { label: 'Ignored (.ignore plugin)', hex: '#808080' },
  { label: 'Merged', hex: '#9776a9' },
  { label: 'Merged with conflicts', hex: '#d5756c' },
  { label: 'Merged with property conflicts', hex: '#d5756c' },
  { label: 'Merged with text and property conflicts', hex: '#d5756c' },
  { label: 'Modified', hex: '#6997bb', status: 'modified' },
  { label: 'Modified in not active changelist', hex: '#6997bb' },
  { label: 'Obsolete', hex: '#d1d3d9' },
  { label: 'Renamed', hex: '#3a8484', status: 'renamed' },
  { label: 'Staged', hex: '#629755', status: 'staged' },
  { label: 'Suppressed', hex: '#d1d3d9' },
  { label: 'Switched', hex: '#d1d3d9' },
  { label: 'Unknown', hex: '#d1665a', status: 'untracked' },
];

export const GIT_STATUS_STATUSES: GitFileStatus[] = GIT_STATUS_SETTINGS_ROWS.flatMap((row) =>
  row.status ? [row.status] : [],
);

export const GIT_STATUS_COLORS_STORAGE_KEY = 'studio-git-status-colors';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function sanitizeColors(input: unknown): GitStatusColors {
  const next = { ...DEFAULT_GIT_STATUS_COLORS };
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const status of GIT_STATUS_STATUSES) {
      const value = record[status];
      if (isHex(value)) {
        next[status] = value.toLowerCase();
      }
    }
  }
  return next;
}

export type GitStatusColorsState = {
  colors: GitStatusColors;
  setColor: (status: GitFileStatus, value: string) => void;
  resetColors: () => void;
};

export const useGitStatusColors = create<GitStatusColorsState>()(
  persist(
    (set) => ({
      colors: DEFAULT_GIT_STATUS_COLORS,
      setColor: (status, value) => {
        if (!isHex(value)) {
          return;
        }
        set((state) => ({ colors: { ...state.colors, [status]: value.toLowerCase() } }));
      },
      resetColors: () => set({ colors: DEFAULT_GIT_STATUS_COLORS }),
    }),
    {
      name: GIT_STATUS_COLORS_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ colors: state.colors }),
      migrate: (persisted) => {
        const state = persisted as { colors?: unknown };
        return { colors: sanitizeColors(state.colors) };
      },
    },
  ),
);

export function gitStatusColorClass(status: GitFileStatus): string {
  switch (status) {
    case 'deleted':
      return 'line-through';
    case 'ignored':
      return 'opacity-70';
    default:
      return '';
  }
}
