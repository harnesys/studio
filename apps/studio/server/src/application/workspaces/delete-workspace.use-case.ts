import type { NodeRegistry } from '../nodes/node-registry.ts';

export type DeleteWorkspaceRequest = {
  id: string;
};

export type DeleteWorkspaceInput = {
  execute(request: DeleteWorkspaceRequest): Promise<void>;
};

/** Phase 3: remove from host.nodes only. Domain rows stay until Phase 4b. */
export class DeleteWorkspaceUseCase implements DeleteWorkspaceInput {
  constructor(private readonly nodes: NodeRegistry) {}

  execute(request: DeleteWorkspaceRequest): Promise<void> {
    this.nodes.removeFromHost(request.id);
    return Promise.resolve();
  }
}
