import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { useIdeStore } from './ide.store';

/**
 * Single owner of URL -> IDE tab sync. Fires only after the workspace
 * hydrate fills thread/file stores, so deep links open their tab instead
 * of relying on persisted tab state. User clicks navigate first and land
 * here as an idempotent no-op.
 *
 * Tab identity is threadId. When current speaker (thread.agentId) changes,
 * the same tab is patched in place and `?agent=` is replaced — no remount.
 */
export function useIdeSync() {
  const navigate = useNavigate();
  const { workspaceId, threadId, filePath, threadOrigin, originEntityId } = useStudioLocation();
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
    if (!threadId || !threadAgentId || hydratedWorkspaceId !== workspaceId) {
      return;
    }
    if (!useThreadStore.getState().byId(threadId)) {
      return;
    }
    useIdeStore.getState().openThread(workspaceId, threadAgentId, threadId);
    if (useDeskStore.getState().focusedThreadId !== threadId) {
      useDeskStore.getState().setFocusedThreadId(threadId);
    }
    setActiveThreadId(threadAgentId, threadId);
    // Handoff keeps the thread route; only `?agent=` (or missing origin) tracks current.
    if ((threadOrigin === 'agent' || threadOrigin === null) && originEntityId !== threadAgentId) {
      void navigate(
        studioPath.thread(workspaceId, threadId, { kind: 'agent', id: threadAgentId }),
        { replace: true },
      );
    }
  }, [
    workspaceId,
    threadId,
    threadAgentId,
    filePath,
    hydratedWorkspaceId,
    threadOrigin,
    originEntityId,
    navigate,
  ]);
}
