import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type PullGitRequest = {
  workspaceId: string;
};

export type PullGitResponse = {
  ok: true;
};

export type PullGitInput = {
  execute(req: PullGitRequest): Promise<PullGitResponse>;
};

export class PullGitUseCase implements PullGitInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}

  async execute(req: PullGitRequest): Promise<PullGitResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    await this.git.pull(workspace.path);
    return { ok: true };
  }
}
