import type { WorkspaceRecord } from '../../../shared/types.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

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
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys?: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: UpdateWorkspaceRequest): Promise<WorkspaceRecord> {
    const existing = this.workspaces.findById(request.id);
    if (!existing) {
      throw new NotFoundError('workspace not found');
    }
    const updated = this.workspaces.update(request.id, {
      name: request.name,
      path: request.path,
    });
    if (request.path !== undefined && request.path !== existing.path) {
      await this.workspaceHarnesys?.forget(request.id);
    }
    return updated;
  }
}
