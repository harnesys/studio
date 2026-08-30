import type { WorkspaceSkill } from '../../../shared/types.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type ListWorkspaceSkillsRequest = {
  workspaceId: string;
};

export type ListWorkspaceSkillsResponse = {
  skills: WorkspaceSkill[];
};

export type ListWorkspaceSkillsInput = {
  execute(request: ListWorkspaceSkillsRequest): Promise<ListWorkspaceSkillsResponse>;
};

export class ListWorkspaceSkillsUseCase implements ListWorkspaceSkillsInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: ListWorkspaceSkillsRequest): Promise<ListWorkspaceSkillsResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const hx = await this.workspaceHarnesys.get(workspace);
    return {
      skills: (await hx.skills.list()).map((skill) => ({
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse,
      })),
    };
  }
}
