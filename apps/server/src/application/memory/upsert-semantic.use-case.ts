import type { MemoryRecord, SemanticMemoryPort, SemanticScope } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';
export type UpsertSemanticRequest = {
  workspaceId: string;
  agentId: string;
  scope: SemanticScope;
  text: string;
  key?: string;
  threadId?: string;
};
export type UpsertSemanticInput = {
  execute(request: UpsertSemanticRequest): Promise<MemoryRecord>;
};
export class UpsertSemanticUseCase implements UpsertSemanticInput {
  constructor(
    private readonly semantic: SemanticMemoryPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}
  execute(request: UpsertSemanticRequest): Promise<MemoryRecord> {
    const scopeId = resolveAgentMemoryScope(this.workspaces, this.agents, {
      workspaceId: request.workspaceId,
      agentId: request.agentId,
      threadId: request.threadId,
    });
    return this.semantic.upsert(scopeId, {
      scope: request.scope,
      text: request.text,
      key: request.key,
      threadId: request.threadId,
      source: 'human',
    });
  }
}
