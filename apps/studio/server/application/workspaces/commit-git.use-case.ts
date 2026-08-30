import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type CommitGitRequest = {
  workspaceId: string;
  message: string;
};

export type CommitGitResponse = {
  ok: true;
};

export type CommitGitInput = {
  execute(req: CommitGitRequest): Promise<CommitGitResponse>;
};

export class CommitGitUseCase implements CommitGitInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}

  async execute(req: CommitGitRequest): Promise<CommitGitResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const msg = req.message?.trim();
    if (!msg) {
      throw new Error('message is required');
    }
    if (msg.length > 2000) {
      throw new Error('message too long');
    }
    await this.git.commit(workspace.path, msg);
    return { ok: true };
  }
}
