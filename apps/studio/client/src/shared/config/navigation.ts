import { useNavigate, useParams } from 'react-router';

import { studioPath, type ThreadOriginRef } from './routes';
import type { SettingsCategory } from './settings-nav';

export function useStudioNavigation() {
  const navigate = useNavigate();
  const workspaceId = useParams().workspaceId ?? null;

  return {
    openWorkspace(id: string) {
      void navigate(studioPath.workspace(id));
    },
    leaveWorkspace() {
      void navigate(studioPath.gate);
    },
    openThread(threadId: string, origin?: ThreadOriginRef, id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.thread(id, threadId, origin));
      }
    },
    openFile(path: string, id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.file(id, path));
      }
    },
    openAgentLanding(agentId: string, id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.agent(id, agentId));
      }
    },
    openSettings(
      category?: SettingsCategory,
      id: string | null = workspaceId,
      providerId?: string,
      replace = false,
    ) {
      if (id) {
        void navigate(studioPath.settings(id, category, providerId), { replace });
      }
    },
  };
}
