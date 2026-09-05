import { useMatch, useParams, useSearchParams } from 'react-router';
import {
  parseSettingsCategory,
  type StudioLocation,
  type StudioSurface,
  type ThreadOrigin,
} from './routes';
import type { SettingsCategory } from './settings-nav';

export function useStudioLocation(): StudioLocation {
  const params = useParams();
  const [search] = useSearchParams();
  const settingsWithProvider = useMatch('/w/:workspaceId/settings/:category/:providerId');
  const settingsFallback = useMatch('/w/:workspaceId/settings/:category?');
  const thread = useMatch('/w/:workspaceId/thread/:threadId');
  const file = useMatch('/w/:workspaceId/file/*');
  const agent = useMatch('/w/:workspaceId/agent/:agentId');
  const settings = settingsWithProvider ?? settingsFallback;

  let surface: StudioSurface = 'home';
  if (settings) {
    surface = 'settings';
  } else if (thread) {
    surface = 'thread';
  } else if (file) {
    surface = 'file';
  } else if (agent) {
    surface = 'agent';
  }

  let threadOrigin: ThreadOrigin | null = null;
  let originEntityId: string | null = null;
  for (const key of ['agent', 'scheduler', 'webhook'] as const) {
    const value = search.get(key);
    if (value) {
      threadOrigin = key;
      originEntityId = value;
      break;
    }
  }

  const settingsCategory: SettingsCategory = parseSettingsCategory(
    settings?.params.category ?? params.category,
  );

  return {
    workspaceId: params.workspaceId ?? null,
    surface,
    threadId: thread?.params.threadId ?? null,
    threadOrigin,
    originEntityId,
    agentId: agent?.params.agentId ?? null,
    filePath: file?.params['*'] ? `/${file.params['*']}` : null,
    settingsCategory,
    settingsProviderId:
      settingsCategory === 'providers' ? (settingsWithProvider?.params.providerId ?? null) : null,
  };
}
