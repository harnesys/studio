import type { WorkspaceSkill } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { collectWorkspaceSkills } from './list-workspace-skills.use-case.ts';
export type ReloadWorkspaceSkillsRequest = {
  workspaceId: string;
};
export type ReloadWorkspaceSkillsResponse = {
  skills: WorkspaceSkill[];
};
export type ReloadWorkspaceSkillsInput = {
  execute(request: ReloadWorkspaceSkillsRequest): Promise<ReloadWorkspaceSkillsResponse>;
};
export class ReloadWorkspaceSkillsUseCase implements ReloadWorkspaceSkillsInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}
  async execute(request: ReloadWorkspaceSkillsRequest): Promise<ReloadWorkspaceSkillsResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    await this.workspaceHarnesys.invalidate(workspace.id);
    const hx = await this.workspaceHarnesys.get(workspace);
    const plugins = await this.workspaceHarnesys.loadEnabledPlugins(workspace.id);
    return { skills: await collectWorkspaceSkills(hx, plugins) };
  }
}
