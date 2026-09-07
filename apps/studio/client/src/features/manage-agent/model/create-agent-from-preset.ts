import { type Agent, toClientAgent, useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import { createAgentFromPresetRecord, createThreadRecord } from '@/shared/api';

export type CreateAgentFromPresetResult = {
  agent: Agent;
  thread: Thread;
};

export async function createAgentFromPreset(
  workspaceId: string,
  presetId: string,
): Promise<CreateAgentFromPresetResult | null> {
  if (!workspaceId || !presetId) {
    return null;
  }
  const record = await createAgentFromPresetRecord(workspaceId, presetId);
  const agent = toClientAgent(record);
  useAgentStore.getState().upsert(agent);
  const threadRecord = await createThreadRecord({ workspaceId, agentId: record.id });
  const thread = toClientThread(threadRecord);
  useThreadStore.getState().upsert(thread);
  useSessionStore.getState().replaceEvents(threadRecord.id, threadRecord.events);
  return { agent, thread };
}
