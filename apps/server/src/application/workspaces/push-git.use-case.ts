import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type PushGitRequest = {
  workspaceId: string;
};
export type PushGitResponse = {
  ok: true;
};
export type PushGitInput = {
  execute(req: PushGitRequest): Promise<PushGitResponse>;
};
export class PushGitUseCase implements PushGitInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}
  async execute(req: PushGitRequest): Promise<PushGitResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    await this.git.push(workspace.path);
    return { ok: true };
  }
}
