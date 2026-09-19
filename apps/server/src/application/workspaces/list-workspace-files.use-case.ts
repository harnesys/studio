import { join } from 'node:path';
import type { WorkspaceFileEntry } from '@harnesys/studio-shared';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';
export type ListWorkspaceFilesRequest = {
  workspaceId: string;
  subPath?: string;
};
export type ListWorkspaceFilesResponse = {
  entries: WorkspaceFileEntry[];
};
export type ListWorkspaceFilesInput = {
  execute(req: ListWorkspaceFilesRequest): Promise<ListWorkspaceFilesResponse>;
};
export class ListWorkspaceFilesUseCase implements ListWorkspaceFilesInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}
  async execute(req: ListWorkspaceFilesRequest): Promise<ListWorkspaceFilesResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const sub = (req.subPath ?? '').replace(/^\/+/, '');
    const absPath = sub ? join(workspace.path, sub) : workspace.path;
    const entries = await this.files.listDir(absPath);
    return { entries };
  }
}
