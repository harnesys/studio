import type { GitFileStatusMap } from '@harnesys/studio-shared';
import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type GetGitFileStatusRequest = {
  workspaceId: string;
  subPath?: string;
};

export type GetGitFileStatusResponse = {
  map: GitFileStatusMap;
  truncated: boolean;
};

export type GetGitFileStatusInput = {
  execute(req: GetGitFileStatusRequest): Promise<GetGitFileStatusResponse>;
};

export class GetGitFileStatusUseCase implements GetGitFileStatusInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}

  async execute(req: GetGitFileStatusRequest): Promise<GetGitFileStatusResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const sub = (req.subPath ?? '').replace(/^\/+/, '');
    return await this.git.getFileStatus(workspace.path, sub || undefined);
  }
}
