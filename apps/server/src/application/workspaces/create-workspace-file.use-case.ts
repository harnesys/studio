import { join } from 'node:path';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';
export type CreateWorkspaceFileRequest = {
  workspaceId: string;
  path: string;
  kind: 'file' | 'dir';
};
export type CreateWorkspaceFileResponse = {
  path: string;
  kind: 'file' | 'dir';
};
export type CreateWorkspaceFileInput = {
  execute(req: CreateWorkspaceFileRequest): Promise<CreateWorkspaceFileResponse>;
};
export class CreateWorkspaceFileUseCase implements CreateWorkspaceFileInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}
  async execute(req: CreateWorkspaceFileRequest): Promise<CreateWorkspaceFileResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const rel = req.path.replace(/^\/+/, '');
    if (!rel) {
      throw new ValidationError('path is required');
    }
    const absPath = join(workspace.path, rel);
    if (req.kind === 'dir') {
      await this.files.createDir(absPath);
    } else {
      await this.files.createFile(absPath);
    }
    return { path: rel, kind: req.kind };
  }
}
