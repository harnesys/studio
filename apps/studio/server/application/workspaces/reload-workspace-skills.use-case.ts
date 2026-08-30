import type { WorkspaceSkill } from '../../../shared/types.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

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
    return {
      skills: hx.listSkills().map((skill) => ({
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse,
      })),
    };
  }
}
