import type { WorkspaceStatus } from '../../../shared/types.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspacePort, WorkspaceRepository } from '../../domain/workspace.port.ts';

export type GetWorkspaceStatusRequest = {
  id: string;
};

export type GetWorkspaceStatusInput = {
  execute(request: GetWorkspaceStatusRequest): Promise<WorkspaceStatus>;
};

export class GetWorkspaceStatusUseCase implements GetWorkspaceStatusInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceFs: WorkspacePort,
  ) {}

  async execute(request: GetWorkspaceStatusRequest): Promise<WorkspaceStatus> {
    const workspace = this.workspaces.findById(request.id);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    return await this.workspaceFs.inspect(workspace.path);
  }
}
