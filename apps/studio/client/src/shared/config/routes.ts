import { SETTINGS_CATEGORIES, type SettingsCategory } from './settings-nav';

/** Phase 1: may still include domain ids from settings-nav until Phase 2. */
export type WindowSettingsCategory = SettingsCategory;

export type StudioFocusKind = 'thread' | 'file' | 'diff' | 'schedule' | 'webhook' | 'spawn';

export type StudioFocus =
  | { kind: 'none' }
  | { kind: 'settings'; category: WindowSettingsCategory; providerId: string | null }
  | {
      kind: 'thread';
      workspaceId: string;
      threadId: string;
    }
  | { kind: 'file'; workspaceId: string; path: string }
  | { kind: 'diff'; workspaceId: string; path: string }
  | { kind: 'schedule'; workspaceId: string; scheduleId: string }
  | { kind: 'webhook'; workspaceId: string; webhookId: string }
  | { kind: 'spawn'; workspaceId: string; threadId: string; spawnId: string };

export const studioPath = {
  desk: '/',
  thread: (workspaceId: string, threadId: string) => `/${workspaceId}/thread/${threadId}`,
  file: (workspaceId: string, path: string) =>
    `/${workspaceId}/file${path.startsWith('/') ? path : `/${path}`}`,
  diff: (workspaceId: string, path: string) =>
    `/${workspaceId}/diff${path.startsWith('/') ? path : `/${path}`}`,
  schedule: (workspaceId: string, scheduleId: string) => `/${workspaceId}/schedule/${scheduleId}`,
  webhook: (workspaceId: string, webhookId: string) => `/${workspaceId}/webhook/${webhookId}`,
  spawn: (workspaceId: string, threadId: string, spawnId: string) =>
    `/${workspaceId}/spawn/${threadId}/${spawnId}`,
  settings: (category?: WindowSettingsCategory, providerId?: string) => {
    if (category && category !== 'profile') {
      if (category === 'providers' && providerId) {
        return `/settings/providers/${providerId}`;
      }
      return `/settings/${category}`;
    }
    return '/settings';
  },
};

export function parseSettingsCategory(value: string | undefined): WindowSettingsCategory {
  if (value && (SETTINGS_CATEGORIES as readonly string[]).includes(value)) {
    return value as WindowSettingsCategory;
  }
  return 'profile';
}

export function studioFocusWorkspaceId(focus: StudioFocus): string | null {
  if (focus.kind === 'none' || focus.kind === 'settings') {
    return null;
  }
  return focus.workspaceId;
}

export function studioFocusThreadId(focus: StudioFocus): string | null {
  if (focus.kind === 'thread' || focus.kind === 'spawn') {
    return focus.threadId;
  }
  return null;
}
