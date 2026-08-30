import { useMatch, useParams } from 'react-router';

import { parseSettingsCategory, type StudioLocation, type StudioSurface } from './routes';
import type { SettingsCategory } from './settings-nav';

export function useStudioLocation(): StudioLocation {
  const params = useParams();
  const settingsWithProvider = useMatch('/w/:workspaceId/settings/:category/:providerId');
  const settingsFallback = useMatch('/w/:workspaceId/settings/:category?');
  const settings = settingsWithProvider ?? settingsFallback;
  const schedule = useMatch('/w/:workspaceId/schedules/:scheduleId');
  const schedulesList = useMatch('/w/:workspaceId/schedules');
  const webhook = useMatch('/w/:workspaceId/webhooks/:webhookId');
  const webhooksList = useMatch('/w/:workspaceId/webhooks');
  const files = useMatch('/w/:workspaceId/files');
  const threadsList = useMatch('/w/:workspaceId/agent/:agentId/threads');
  let surface: StudioSurface = 'chat';
  if (settings) {
    surface = 'settings';
  } else if (schedule || schedulesList) {
    surface = 'schedules';
  } else if (webhook || webhooksList) {
    surface = 'webhooks';
  } else if (files) {
    surface = 'files';
  }
  const workspaceId = params.workspaceId ?? null;
  const agentId = surface === 'chat' ? (params.agentId ?? null) : null;
  let threadId: string | null = null;
  if (surface === 'chat' && !threadsList) {
    if (params.threadId === 'threads') {
      threadId = null;
    } else {
      threadId = params.threadId ?? null;
    }
  }
  const scheduleId = surface === 'schedules' ? (schedule?.params.scheduleId ?? null) : null;
  const webhookId = surface === 'webhooks' ? (webhook?.params.webhookId ?? null) : null;
  const settingsCategory: SettingsCategory = parseSettingsCategory(
    settings?.params.category ?? params.category,
  );
  const settingsProviderId =
    settingsCategory === 'providers' ? (settingsWithProvider?.params.providerId ?? null) : null;
  return {
    workspaceId,
    surface,
    agentId,
    threadId,
    scheduleId,
    webhookId,
    settingsCategory,
    settingsProviderId,
  };
}
