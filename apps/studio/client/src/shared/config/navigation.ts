import { useNavigate, useParams } from 'react-router';

import { studioPath } from './routes';
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
    openChat(id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.workspace(id));
      }
    },
    openAgent(workspaceId: string, agentId: string) {
      void navigate(studioPath.workspaceAgent(workspaceId, agentId));
    },
    openThread(workspaceId: string, agentId: string, threadId: string) {
      void navigate(studioPath.workspaceThread(workspaceId, agentId, threadId));
    },
    openThreads(workspaceId: string, agentId: string) {
      void navigate(studioPath.threads(workspaceId, agentId));
    },
    openSchedules(id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.schedules(id));
      }
    },
    openSchedule(workspaceId: string, scheduleId: string) {
      void navigate(studioPath.schedule(workspaceId, scheduleId));
    },
    openWebhooks(id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.webhooks(id));
      }
    },
    openWebhook(workspaceId: string, webhookId: string) {
      void navigate(studioPath.webhook(workspaceId, webhookId));
    },
    openFiles(id: string | null = workspaceId) {
      if (id) {
        void navigate(studioPath.files(id));
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
