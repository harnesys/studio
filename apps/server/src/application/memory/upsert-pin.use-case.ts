import type { PinPort, PinRecord } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from './agent-memory-scope.ts';

export type UpsertPinRequest = {
  workspaceId: string;
  agentId: string;
  key: string;
  text: string;
};

export type UpsertPinInput = {
  execute(request: UpsertPinRequest): Promise<PinRecord>;
};

export class UpsertPinUseCase implements UpsertPinInput {
  constructor(
    private readonly pins: PinPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
  ) {}

  execute(request: UpsertPinRequest): Promise<PinRecord> {
    const scope = resolveAgentMemoryScope(this.workspaces, this.agents, request);
    return this.pins.upsert(scope, {
      key: request.key,
      text: request.text,
      source: 'human',
    });
  }
}
