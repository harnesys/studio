import { basename } from 'node:path';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';
import { resolveWorkspaceRelPath } from './workspace-path.ts';

export type GetWorkspaceFileContentRequest = {
  workspaceId: string;
  path: string;
};

export type GetWorkspaceFileContentResponse = {
  path: string;
  name: string;
  bytes: Uint8Array;
  mimeType: string;
};

export type GetWorkspaceFileContentInput = {
  execute(req: GetWorkspaceFileContentRequest): Promise<GetWorkspaceFileContentResponse>;
};

export class GetWorkspaceFileContentUseCase implements GetWorkspaceFileContentInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}

  async execute(req: GetWorkspaceFileContentRequest): Promise<GetWorkspaceFileContentResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }

    const rel = req.path.replace(/^\/+/, '');
    if (!rel) {
      throw new ValidationError('path is required');
    }

    const absPath = resolveWorkspaceRelPath(workspace.path, rel);
    const info = await this.files.stat(absPath);
    if (!info) {
      throw new NotFoundError(`File ${rel} not found`);
    }

    const { bytes, mimeType } = await this.files.readFile(absPath);
    return { path: rel, name: basename(rel), bytes, mimeType };
  }
}
