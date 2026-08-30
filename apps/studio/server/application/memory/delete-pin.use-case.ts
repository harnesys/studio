import type { PinPort } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';

export type DeletePinRequest = {
  workspaceId: string;
  agentId: string;
  key: string;
};

export type DeletePinInput = {
  execute(request: DeletePinRequest): Promise<void>;
};

export class DeletePinUseCase implements DeletePinInput {
  constructor(
    private readonly pins: PinPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}

  execute(request: DeletePinRequest): Promise<void> {
    const scope = resolveAgentMemoryScope(this.workspaces, this.agents, request);
    return this.pins.remove(scope, request.key);
  }
}
