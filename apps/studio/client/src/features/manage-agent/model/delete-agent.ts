import { useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { clearActiveThreadId, useThreadStore } from '@/entities/thread';
import { deleteAgentRecord } from '@/shared/api';

export async function deleteAgent(workspaceId: string, agentId: string) {
  const agent = useAgentStore.getState().byId(agentId);
  if (!agent) {
    return;
  }
  await deleteAgentRecord(workspaceId, agentId);
  const threadIds = useThreadStore.getState().removeForAgent(agentId);
  useSessionStore.getState().removeForThreads(threadIds);
  useAgentStore.getState().remove(agentId);
  clearActiveThreadId(agentId);
}
