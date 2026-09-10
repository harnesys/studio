import { type Agent, toClientAgent, useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import { createAgentFromPresetRecord, createThreadRecord } from '@/shared/api';

import { refreshWorkspaceAgents } from './create-agent';

export type CreateAgentFromPresetResult = {
  agent: Agent;
  thread: Thread | null;
};

export async function createAgentFromPreset(
  workspaceId: string,
  presetId: string,
  options?: { parentId?: string | null },
): Promise<CreateAgentFromPresetResult | null> {
  if (!workspaceId || !presetId) {
    return null;
  }
  const record = await createAgentFromPresetRecord(workspaceId, presetId, options);
  const agent = toClientAgent(record);
  useAgentStore.getState().upsert(agent);
  // Seeds (Explorer/General under Assistant, etc.) land in the same request on the server.
  await refreshWorkspaceAgents(workspaceId);

  if (agent.parentId) {
    return { agent, thread: null };
  }

  const threadRecord = await createThreadRecord({ workspaceId, agentId: record.id });
  const thread = toClientThread(threadRecord);
  useThreadStore.getState().upsert(thread);
  useSessionStore.getState().replaceEvents(threadRecord.id, threadRecord.events);
  return { agent, thread };
}
