import type { GitStatusResponse } from '@harnesys/studio-shared';
import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type GetGitStatusRequest = {
  workspaceId: string;
};
export type GetGitStatusResponse = GitStatusResponse;
export type GetGitStatusInput = {
  execute(req: GetGitStatusRequest): Promise<GetGitStatusResponse>;
};
export class GetGitStatusUseCase implements GetGitStatusInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}
  async execute(req: GetGitStatusRequest): Promise<GetGitStatusResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    return await this.git.getStatus(workspace.path);
  }
}
