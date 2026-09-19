import { join } from 'node:path';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';
export type DeleteWorkspaceFileRequest = {
  workspaceId: string;
  path: string;
};
export type DeleteWorkspaceFileInput = {
  execute(req: DeleteWorkspaceFileRequest): Promise<void>;
};
export class DeleteWorkspaceFileUseCase implements DeleteWorkspaceFileInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}
  async execute(req: DeleteWorkspaceFileRequest): Promise<void> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const rel = req.path.replace(/^\/+/, '');
    if (!rel) {
      throw new ValidationError('path is required');
    }
    const absPath = join(workspace.path, rel);
    await this.files.delete(absPath);
  }
}
