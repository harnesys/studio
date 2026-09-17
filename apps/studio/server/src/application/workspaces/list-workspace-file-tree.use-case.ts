import type { WorkspaceFileEntry } from '@harnesys/studio-shared';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';

export type ListWorkspaceFileTreeRequest = {
  workspaceId: string;
  includeHidden?: boolean;
};

export type ListWorkspaceFileTreeResponse = {
  entries: WorkspaceFileEntry[];
};

export type ListWorkspaceFileTreeInput = {
  execute(req: ListWorkspaceFileTreeRequest): Promise<ListWorkspaceFileTreeResponse>;
};

export class ListWorkspaceFileTreeUseCase implements ListWorkspaceFileTreeInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly files: WorkspaceFilesPort,
  ) {}

  async execute(req: ListWorkspaceFileTreeRequest): Promise<ListWorkspaceFileTreeResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const entries = await this.files.listTree(workspace.path, {
      includeSafety: req.includeHidden ?? false,
    });
    return { entries };
  }
}
