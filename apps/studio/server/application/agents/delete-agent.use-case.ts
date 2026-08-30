import type { AgentRepository } from '../../domain/agent.port.ts';
import { requireAgent } from './agent.helpers.ts';

export type DeleteAgentRequest = {
  workspaceId: string;
  id: string;
};

export type DeleteAgentInput = {
  execute(request: DeleteAgentRequest): Promise<void>;
};

export class DeleteAgentUseCase implements DeleteAgentInput {
  constructor(private readonly agents: AgentRepository) {}

  async execute(request: DeleteAgentRequest): Promise<void> {
    requireAgent(this.agents, request.workspaceId, request.id);
    this.agents.delete(request.id);
    await Promise.resolve();
  }
}
