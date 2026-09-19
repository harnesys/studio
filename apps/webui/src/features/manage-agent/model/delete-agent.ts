import { useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { clearActiveThreadId, useThreadStore } from '@/entities/thread';
import { deleteAgentRecord } from '@/shared/api';
export async function deleteAgent(workspaceId: string, agentId: string) {
  const agent = useAgentStore.getState().byId(agentId);
  if (!agent) {
    return;
  }
  const delegateIds = useAgentStore
    .getState()
    .items.filter((item) => item.parentId === agentId)
    .map((item) => item.id);
  await deleteAgentRecord(workspaceId, agentId);
  for (const id of [...delegateIds, agentId]) {
    const threadIds = useThreadStore.getState().removeForAgent(id);
    useSessionStore.getState().removeForThreads(threadIds);
    useAgentStore.getState().remove(id);
    clearActiveThreadId(id);
  }
}
