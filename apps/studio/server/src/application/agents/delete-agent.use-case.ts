import type { AgentRepository } from '../../domain/agent.port.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { requireAgent } from './agent.helpers.ts';

export type DeleteAgentRequest = {
  workspaceId: string;
  id: string;
};

export type DeleteAgentInput = {
  execute(request: DeleteAgentRequest): Promise<void>;
};

export class DeleteAgentUseCase implements DeleteAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly threads: ThreadRepository,
  ) {}

  async execute(request: DeleteAgentRequest): Promise<void> {
    requireAgent(this.agents, request.workspaceId, request.id);
    const delegates = this.agents
      .listByWorkspace(request.workspaceId)
      .filter((agent) => agent.parentId === request.id);
    for (const delegate of delegates) {
      this.threads.deleteByAgent(delegate.id);
      this.agents.delete(delegate.id);
    }
    this.threads.deleteByAgent(request.id);
    this.agents.delete(request.id);
    await Promise.resolve();
  }
}
