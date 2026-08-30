import type { PinPort, PinRecord } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';

export type ListPinsRequest = {
  workspaceId: string;
  agentId: string;
};

export type ListPinsInput = {
  execute(request: ListPinsRequest): Promise<PinRecord[]>;
};

export class ListPinsUseCase implements ListPinsInput {
  constructor(
    private readonly pins: PinPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}

  execute(request: ListPinsRequest): Promise<PinRecord[]> {
    const scope = resolveAgentMemoryScope(this.workspaces, this.agents, request);
    return this.pins.list(scope);
  }
}
