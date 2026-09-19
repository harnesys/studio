import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspacePort, WorkspaceRepository } from '../../domain/workspace.port.ts';

export type RevealWorkspaceRequest = {
  id: string;
};

export type RevealWorkspaceInput = {
  execute(request: RevealWorkspaceRequest): Promise<void>;
};

export class RevealWorkspaceUseCase implements RevealWorkspaceInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceFs: WorkspacePort,
  ) {}

  async execute(request: RevealWorkspaceRequest): Promise<void> {
    const workspace = this.workspaces.findById(request.id);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    await this.workspaceFs.reveal(workspace.path);
  }
}
