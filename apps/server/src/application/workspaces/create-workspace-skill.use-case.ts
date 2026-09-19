import type { CreateWorkspaceSkillRequest, WorkspaceSkill } from '@harnesys/studio-shared';
import { createWorkspaceSkillFile } from '../../adapters/skills-fs.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type CreateWorkspaceSkillUseCaseRequest = CreateWorkspaceSkillRequest & {
  workspaceId: string;
};

export type CreateWorkspaceSkillResponse = {
  skill: WorkspaceSkill;
};

export type CreateWorkspaceSkillInput = {
  execute(request: CreateWorkspaceSkillUseCaseRequest): Promise<CreateWorkspaceSkillResponse>;
};

export class CreateWorkspaceSkillUseCase implements CreateWorkspaceSkillInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(
    request: CreateWorkspaceSkillUseCaseRequest,
  ): Promise<CreateWorkspaceSkillResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    createWorkspaceSkillFile(workspace.path, {
      name: request.name,
      description: request.description,
      ...(request.whenToUse !== undefined ? { whenToUse: request.whenToUse } : {}),
      instructions: request.instructions,
    });

    await this.workspaceHarnesys.invalidate(workspace.id);
    const hx = await this.workspaceHarnesys.get(workspace);
    const skill = (await hx.skills.list()).find((s) => s.name === request.name);
    if (!skill) {
      throw new ValidationError(`skill ${request.name} was written but not loaded`);
    }

    return {
      skill: {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
        origin: { kind: 'workspace' },
      },
    };
  }
}
