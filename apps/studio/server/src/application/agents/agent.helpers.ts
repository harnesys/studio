import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';

export function requireAgent(agents: AgentRepository, workspaceId: string, agentId: string): Agent {
  const found = agents.findById(agentId);
  if (!found || found.workspaceId !== workspaceId) {
    throw new NotFoundError('agent not found');
  }
  return found;
}
