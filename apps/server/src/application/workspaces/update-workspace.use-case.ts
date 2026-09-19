import type { WorkspaceRecord } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { NodeRegistry } from '../nodes/node-registry.ts';

export type UpdateWorkspaceRequest = {
  id: string;
  name?: string;
  path?: string;
};

export type UpdateWorkspaceInput = {
  execute(request: UpdateWorkspaceRequest): Promise<WorkspaceRecord>;
};

export class UpdateWorkspaceUseCase implements UpdateWorkspaceInput {
  constructor(
    private readonly nodes: NodeRegistry,
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys?: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: UpdateWorkspaceRequest): Promise<WorkspaceRecord> {
    const existing = this.nodes.get(request.id);
    const previousPath = existing?.path;
    const updated = this.nodes.update(request.id, {
      name: request.name,
      path: request.path,
    });
    if (request.path !== undefined && previousPath !== undefined && request.path !== previousPath) {
      await this.workspaceHarnesys?.forget(request.id);
    }
    const row = this.workspaces.findById(updated.id);
    return {
      id: updated.id,
      name: updated.name,
      path: updated.path,
      createdAt: row?.createdAt ?? new Date(0).toISOString(),
      status: this.nodes.status(updated.id),
    };
  }
}
