import { SETTINGS_CATEGORIES, type SettingsCategory } from './settings-nav';

export type StudioSurface = 'home' | 'thread' | 'file' | 'agent' | 'settings';

export type ThreadOrigin = 'agent' | 'scheduler' | 'webhook';

export type ThreadOriginRef = { kind: ThreadOrigin; id: string };

export type StudioLocation = {
  workspaceId: string | null;
  surface: StudioSurface;
  threadId: string | null;
  threadOrigin: ThreadOrigin | null;
  originEntityId: string | null;
  agentId: string | null;
  filePath: string | null;
  settingsCategory: SettingsCategory;
  settingsProviderId: string | null;
};

export const STUDIO_THREAD_PATTERN = '/w/:workspaceId/thread/:threadId';
export const STUDIO_FILE_PATTERN = '/w/:workspaceId/file/*';
export const STUDIO_AGENT_PATTERN = '/w/:workspaceId/agent/:agentId';

export const studioPath = {
  gate: '/',
  workspace: (workspaceId: string) => `/w/${workspaceId}`,
  thread: (workspaceId: string, threadId: string, origin?: ThreadOriginRef) => {
    const base = `/w/${workspaceId}/thread/${threadId}`;
    return origin ? `${base}?${origin.kind}=${origin.id}` : base;
  },
  file: (workspaceId: string, path: string) =>
    `/w/${workspaceId}/file${path.startsWith('/') ? path : `/${path}`}`,
  agent: (workspaceId: string, agentId: string) => `/w/${workspaceId}/agent/${agentId}`,
  settings: (workspaceId: string, category?: SettingsCategory, providerId?: string) => {
    if (category === 'providers' && providerId) {
      return `/w/${workspaceId}/settings/providers/${providerId}`;
    }
    if (category && category !== 'profile') {
      return `/w/${workspaceId}/settings/${category}`;
    }
    return `/w/${workspaceId}/settings`;
  },
};

export function parseSettingsCategory(value: string | undefined): SettingsCategory {
  if (value && (SETTINGS_CATEGORIES as readonly string[]).includes(value)) {
    return value as SettingsCategory;
  }
  return 'profile';
}

export function resolveStudioEntry(input: {
  selectedWorkspaceId: string | null;
  hasWorkspace: boolean;
  workspacesStatus: 'pending' | 'error' | 'success';
}): 'desk' | 'opening' | 'gate' {
  if (input.hasWorkspace) {
    return 'desk';
  }
  if (input.selectedWorkspaceId && input.workspacesStatus === 'pending') {
    return 'opening';
  }
  return 'gate';
}
