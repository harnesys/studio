import { useNavigate } from 'react-router';

import { studioPath } from '@/shared/config/routes';

import type { IdeTab } from './ide.store';

export function useOpenIdeTab() {
  const navigate = useNavigate();
  return (workspaceId: string, tab: IdeTab) => {
    if (tab.kind === 'thread' && tab.threadId) {
      void navigate(studioPath.thread(workspaceId, tab.threadId));
      return;
    }
    if (tab.kind === 'file' && tab.path) {
      void navigate(studioPath.file(workspaceId, tab.path));
    }
  };
}
