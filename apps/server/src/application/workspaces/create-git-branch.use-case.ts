import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type CreateGitBranchRequest = {
  workspaceId: string;
  name: string;
  checkout?: boolean;
  from?: string;
};
export type CreateGitBranchResponse = {
  ok: true;
};
export type CreateGitBranchInput = {
  execute(req: CreateGitBranchRequest): Promise<CreateGitBranchResponse>;
};
export class CreateGitBranchUseCase implements CreateGitBranchInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}
  async execute(req: CreateGitBranchRequest): Promise<CreateGitBranchResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const name = req.name?.trim();
    if (!name) {
      throw new ValidationError('branch name is required');
    }
    const checkout = req.checkout ?? true;
    const from = req.from?.trim() || undefined;
    await this.git.createBranch(workspace.path, name, checkout, from);
    return { ok: true };
  }
}
