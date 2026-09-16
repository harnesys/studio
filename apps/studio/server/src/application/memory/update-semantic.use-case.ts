import type { MemoryRecord, SemanticMemoryPort } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';

export type UpdateSemanticRequest = {
  workspaceId: string;
  agentId: string;
  id: string;
  text: string;
};

export type UpdateSemanticInput = {
  execute(request: UpdateSemanticRequest): Promise<MemoryRecord>;
};

export class UpdateSemanticUseCase implements UpdateSemanticInput {
  constructor(
    private readonly semantic: SemanticMemoryPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}

  execute(request: UpdateSemanticRequest): Promise<MemoryRecord> {
    const scope = resolveAgentMemoryScope(this.workspaces, this.agents, request);
    return this.semantic.update(scope, {
      id: request.id,
      text: request.text,
    });
  }
}
