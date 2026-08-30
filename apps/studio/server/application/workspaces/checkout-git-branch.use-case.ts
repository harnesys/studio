import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type CheckoutGitBranchRequest = {
  workspaceId: string;
  branch: string;
};

export type CheckoutGitBranchResponse = {
  ok: true;
};

export type CheckoutGitBranchInput = {
  execute(req: CheckoutGitBranchRequest): Promise<CheckoutGitBranchResponse>;
};

export class CheckoutGitBranchUseCase implements CheckoutGitBranchInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}

  async execute(req: CheckoutGitBranchRequest): Promise<CheckoutGitBranchResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    if (!req.branch || typeof req.branch !== 'string') {
      throw new Error('branch is required');
    }
    await this.git.checkout(workspace.path, req.branch.trim());
    return { ok: true };
  }
}
