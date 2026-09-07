import { useEffect } from 'react';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { useIdeStore } from './ide.store';

/**
 * Single owner of URL -> IDE tab sync. Fires only after the workspace
 * hydrate fills thread/file stores, so deep links open their tab instead
 * of relying on persisted tab state. User clicks navigate first and land
 * here as an idempotent no-op.
 *
 * Tab identity is threadId. When current speaker (thread.agentId) changes,
 * the same tab is patched in place — no remount / no new tab.
 */
export function useIdeSync() {
  const { workspaceId, threadId, filePath } = useStudioLocation();
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);
  const threadAgentId = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.agentId ?? null) : null,
  );

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    if (filePath) {
      useIdeStore.getState().openFile(workspaceId, filePath);
    }
    if (!threadId || hydratedWorkspaceId !== workspaceId) {
      return;
    }
    const thread = useThreadStore.getState().byId(threadId);
    if (!thread) {
      return;
    }
    useIdeStore.getState().openThread(workspaceId, thread.agentId, threadId);
    if (useDeskStore.getState().focusedThreadId !== threadId) {
      useDeskStore.getState().setFocusedThreadId(threadId);
    }
    setActiveThreadId(thread.agentId, threadId);
  }, [workspaceId, threadId, threadAgentId, filePath, hydratedWorkspaceId]);
}
