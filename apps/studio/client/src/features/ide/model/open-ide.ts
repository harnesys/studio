import { studioPath } from '@/shared/config/routes';
import { useIdeStore } from './ide.store';

export function useOpenIde() {
  return {
    openThread(
      workspaceId: string,
      agentId: string,
      threadId: string,
      navigate: (path: string) => void,
    ) {
      useIdeStore.getState().openThread(workspaceId, agentId, threadId);
      navigate(studioPath.workspaceThread(workspaceId, agentId, threadId));
    },
    openFile(workspaceId: string, path: string, navigate: (pathStr: string) => void) {
      useIdeStore.getState().openFile(workspaceId, path);
      // keep file tabs bookmarkable via query? use files surface as fallback for now
      navigate(studioPath.files(workspaceId));
    },
    openSchedule(workspaceId: string, scheduleId: string, navigate: (path: string) => void) {
      useIdeStore.getState().openSchedule(workspaceId, scheduleId);
      navigate(studioPath.schedule(workspaceId, scheduleId));
    },
    openWebhook(workspaceId: string, webhookId: string, navigate: (path: string) => void) {
      useIdeStore.getState().openWebhook(workspaceId, webhookId);
      navigate(studioPath.webhook(workspaceId, webhookId));
    },
  };
}
