import type { GitDiffResponse } from '../../../shared/types.ts';
import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type GetGitDiffRequest = {
  workspaceId: string;
  path: string;
};

export type GetGitDiffResponse = GitDiffResponse;

export type GetGitDiffInput = {
  execute(req: GetGitDiffRequest): Promise<GetGitDiffResponse>;
};

export class GetGitDiffUseCase implements GetGitDiffInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}

  async execute(req: GetGitDiffRequest): Promise<GetGitDiffResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const p = (req.path ?? '').trim().replace(/^\/+/, '');
    if (!p) {
      throw new Error('path is required');
    }
    if (p.includes('\0') || p.includes('\n')) {
      throw new Error('invalid path');
    }
    return await this.git.getDiff(workspace.path, p);
  }
}
