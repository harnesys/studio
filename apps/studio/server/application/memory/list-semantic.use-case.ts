import type { MemoryRecord, SemanticMemoryPort, SemanticScope } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';
import { sessionTtlFromAgentMemory } from './semantic-session-ttl.ts';

export type ListSemanticRequest = {
  workspaceId: string;
  agentId: string;
  scope?: SemanticScope;
  limit?: number;
};

export type ListSemanticInput = {
  execute(request: ListSemanticRequest): Promise<MemoryRecord[]>;
};

export class ListSemanticUseCase implements ListSemanticInput {
  constructor(
    private readonly semantic: SemanticMemoryPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}

  execute(request: ListSemanticRequest): Promise<MemoryRecord[]> {
    const scope = resolveAgentMemoryScope(this.workspaces, this.agents, request);
    const agent = this.agents.findById(request.agentId);
    const sessionTtl = sessionTtlFromAgentMemory(agent?.memory);
    return this.semantic.list(scope, {
      scope: request.scope,
      limit: request.limit,
      ...(sessionTtl ? { sessionTtl } : {}),
    });
  }
}
