import { type AgentOpenFiles, useDeskStore, type WorkspaceOpenFiles } from '@/features/desk';

const EMPTY_OPEN_FILES: AgentOpenFiles = { tabs: [], activePath: null };
const EMPTY_WORKSPACE_FILES: WorkspaceOpenFiles = { tabs: [], activePath: null };
export function openWorkspaceFile(workspaceId: string, path: string) {
  useDeskStore.getState().openWorkspaceFile(workspaceId, path);
}
export function closeWorkspaceFile(workspaceId: string, path: string) {
  useDeskStore.getState().closeWorkspaceFile(workspaceId, path);
}
export function selectWorkspaceFile(workspaceId: string, path: string) {
  useDeskStore.getState().setActiveWorkspaceFile(workspaceId, path);
}
export function markWorkspaceFileDirty(workspaceId: string, path: string, dirty: boolean) {
  useDeskStore.getState().setWorkspaceFileDirty(workspaceId, path, dirty);
}
export function useWorkspaceOpenFiles(workspaceId: string | null) {
  return useDeskStore((state) => {
    if (!workspaceId) {
      return EMPTY_WORKSPACE_FILES;
    }
    return state.filesByWorkspaceId[workspaceId] ?? EMPTY_WORKSPACE_FILES;
  });
}
export function useAgentOpenFiles(agentId: string | null) {
  return useDeskStore((state) => {
    if (!agentId) {
      return EMPTY_OPEN_FILES;
    }
    return state.filesByAgentId[agentId] ?? EMPTY_OPEN_FILES;
  });
}
