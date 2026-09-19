import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type InitGitRequest = {
  workspaceId: string;
};
export type InitGitResponse = {
  ok: true;
};
export type InitGitInput = {
  execute(req: InitGitRequest): Promise<InitGitResponse>;
};
export class InitGitUseCase implements InitGitInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}
  async execute(req: InitGitRequest): Promise<InitGitResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    await this.git.init(workspace.path);
    return { ok: true };
  }
}
