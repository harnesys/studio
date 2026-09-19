import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';
import { resolveWorkspaceRelPath } from './workspace-path.ts';
export type WriteWorkspaceFileContentRequest = {
  workspaceId: string;
  path: string;
  content: string;
};
export type WriteWorkspaceFileContentResponse = {
  path: string;
};
export type WriteWorkspaceFileContentInput = {
  execute(req: WriteWorkspaceFileContentRequest): Promise<WriteWorkspaceFileContentResponse>;
};
export class WriteWorkspaceFileContentUseCase implements WriteWorkspaceFileContentInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}
  async execute(req: WriteWorkspaceFileContentRequest): Promise<WriteWorkspaceFileContentResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const rel = req.path.replace(/^\/+/, '');
    if (!rel) {
      throw new ValidationError('path is required');
    }
    const absPath = resolveWorkspaceRelPath(workspace.path, rel);
    await this.files.writeFile(absPath, req.content);
    return { path: rel };
  }
}
