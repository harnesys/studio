import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
export type ListAgentsRequest = {
  workspaceId?: string;
};
export type ListAgentsInput = {
  execute(request?: ListAgentsRequest): Promise<Agent[]>;
};
export class ListAgentsUseCase implements ListAgentsInput {
  constructor(private readonly agents: AgentRepository) {}
  execute(request?: ListAgentsRequest): Promise<Agent[]> {
    if (request?.workspaceId) {
      return Promise.resolve(this.agents.listByWorkspace(request.workspaceId));
    }
    return Promise.resolve(this.agents.listAll());
  }
}
