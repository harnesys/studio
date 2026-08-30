import { SETTINGS_CATEGORIES, type SettingsCategory } from './settings-nav';

export type StudioSurface = 'chat' | 'schedules' | 'webhooks' | 'files' | 'settings';

export type StudioLocation = {
  workspaceId: string | null;
  surface: StudioSurface;
  agentId: string | null;
  threadId: string | null;
  scheduleId: string | null;
  webhookId: string | null;
  settingsCategory: SettingsCategory;
  settingsProviderId: string | null;
};

export const STUDIO_AGENT_PATTERN = '/w/:workspaceId/agent/:agentId';
export const STUDIO_THREAD_PATTERN = '/w/:workspaceId/agent/:agentId/:threadId';
export const STUDIO_THREADS_PATTERN = '/w/:workspaceId/agent/:agentId/threads';
export const STUDIO_SCHEDULE_PATTERN = '/w/:workspaceId/schedules/:scheduleId';
export const STUDIO_WEBHOOK_PATTERN = '/w/:workspaceId/webhooks/:webhookId';

export const studioPath = {
  gate: '/',
  workspace: (workspaceId: string) => `/w/${workspaceId}`,
  workspaceAgent: (workspaceId: string, agentId: string) => `/w/${workspaceId}/agent/${agentId}`,
  workspaceThread: (workspaceId: string, agentId: string, threadId: string) =>
    `/w/${workspaceId}/agent/${agentId}/${threadId}`,
  threads: (workspaceId: string, agentId: string) => `/w/${workspaceId}/agent/${agentId}/threads`,
  schedules: (workspaceId: string) => `/w/${workspaceId}/schedules`,
  schedule: (workspaceId: string, scheduleId: string) =>
    `/w/${workspaceId}/schedules/${scheduleId}`,
  webhooks: (workspaceId: string) => `/w/${workspaceId}/webhooks`,
  webhook: (workspaceId: string, webhookId: string) => `/w/${workspaceId}/webhooks/${webhookId}`,
  files: (workspaceId: string) => `/w/${workspaceId}/files`,
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
