import type { MemoryScopeId } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type AgentMemoryScopeRequest = {
  workspaceId: string;
  agentId: string;
  threadId?: string;
};
export function resolveAgentMemoryScope(
  workspaces: WorkspaceRepository,
  agents: AgentRepository,
  request: AgentMemoryScopeRequest,
): MemoryScopeId {
  const workspace = workspaces.findById(request.workspaceId);
  if (!workspace) {
    throw new NotFoundError('workspace not found');
  }
  const agent = agents.findById(request.agentId);
  if (!agent || agent.workspaceId !== request.workspaceId) {
    throw new NotFoundError('agent not found');
  }
  return {
    workspaceId: request.workspaceId,
    agentName: agent.name,
    ...(request.threadId ? { threadId: request.threadId } : {}),
  };
}
