import type { GitPort } from '../../domain/git.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type StageGitRequest = {
  workspaceId: string;
  paths: string[];
};
export type StageGitResponse = {
  ok: true;
};
export type StageGitInput = {
  execute(req: StageGitRequest): Promise<StageGitResponse>;
};
export class StageGitUseCase implements StageGitInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly git: GitPort,
  ) {}
  async execute(req: StageGitRequest): Promise<StageGitResponse> {
    const workspace = this.workspaces.findById(req.workspaceId);
    if (!workspace) {
      throw new NotFoundError(`Workspace ${req.workspaceId} not found`);
    }
    const paths = req.paths ?? [];
    if (!Array.isArray(paths)) {
      throw new Error('paths must be array');
    }
    await this.git.stage(workspace.path, paths);
    return { ok: true };
  }
}
