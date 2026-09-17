import { WINDOW_SETTINGS_CATEGORIES, type WindowSettingsCategory } from './settings-nav';

export type { WindowSettingsCategory };

export type StudioFocusKind =
  | 'thread'
  | 'file'
  | 'diff'
  | 'schedule'
  | 'webhook'
  | 'spawn'
  | 'terminal';

export type StudioFocus =
  | { kind: 'none' }
  | { kind: 'settings'; category: WindowSettingsCategory }
  | {
      kind: 'thread';
      workspaceId: string;
      threadId: string;
    }
  | { kind: 'file'; workspaceId: string; path: string }
  | { kind: 'diff'; workspaceId: string; path: string }
  | { kind: 'schedule'; workspaceId: string; scheduleId: string }
  | { kind: 'webhook'; workspaceId: string; webhookId: string }
  | { kind: 'spawn'; workspaceId: string; threadId: string; spawnId: string }
  | { kind: 'terminal'; workspaceId: string; sessionId: string };

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
  terminal: (workspaceId: string, sessionId: string) => `/${workspaceId}/terminal/${sessionId}`,
  settings: (category?: WindowSettingsCategory) => {
    if (category && category !== 'profile') {
      return `/settings/${category}`;
    }
    return '/settings';
  },
};

export function parseWindowSettingsCategory(value: string | undefined): WindowSettingsCategory {
  if (value && (WINDOW_SETTINGS_CATEGORIES as readonly string[]).includes(value)) {
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
