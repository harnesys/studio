import type { SemanticMemoryPort } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';

export type DeleteSemanticRequest = {
  workspaceId: string;
  agentId: string;
  id: string;
};

export type DeleteSemanticInput = {
  execute(request: DeleteSemanticRequest): Promise<void>;
};

export class DeleteSemanticUseCase implements DeleteSemanticInput {
  constructor(
    private readonly semantic: SemanticMemoryPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}

  execute(request: DeleteSemanticRequest): Promise<void> {
    const scope = resolveAgentMemoryScope(this.workspaces, this.agents, request);
    return this.semantic.remove(scope, request.id);
  }
}
