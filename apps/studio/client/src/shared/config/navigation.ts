import { useNavigate } from 'react-router';

import { studioPath, type WindowSettingsCategory } from './routes';

export function useStudioNavigation() {
  const navigate = useNavigate();

  return {
    openDesk() {
      void navigate(studioPath.desk);
    },
    openThread(workspaceId: string, threadId: string) {
      void navigate(studioPath.thread(workspaceId, threadId));
    },
    openFile(workspaceId: string, path: string) {
      void navigate(studioPath.file(workspaceId, path));
    },
    openDiff(workspaceId: string, path: string) {
      void navigate(studioPath.diff(workspaceId, path));
    },
    openSchedule(workspaceId: string, scheduleId: string) {
      void navigate(studioPath.schedule(workspaceId, scheduleId));
    },
    openWebhook(workspaceId: string, webhookId: string) {
      void navigate(studioPath.webhook(workspaceId, webhookId));
    },
    openSpawn(workspaceId: string, threadId: string, spawnId: string) {
      void navigate(studioPath.spawn(workspaceId, threadId, spawnId));
    },
    openSettings(category?: WindowSettingsCategory, providerId?: string, replace = false) {
      void navigate(studioPath.settings(category, providerId), { replace });
    },
  };
}
