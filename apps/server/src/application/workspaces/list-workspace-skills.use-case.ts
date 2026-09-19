import type { ComponentOrigin, WorkspaceSkill } from '@harnesys/studio-shared';
import type { CommandSpec, RuntimeHandle, SkillSpec } from 'harnesys';
import type {
  LoadedWorkspacePlugin,
  WorkspaceHarnesysRegistry,
} from '../../adapters/workspace-harnesys.registry.ts';
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
    const plugins = await this.workspaceHarnesys.loadEnabledPlugins(workspace.id);
    return { skills: await collectWorkspaceSkills(hx, plugins) };
  }
}
export async function collectWorkspaceSkills(
  hx: RuntimeHandle,
  plugins: LoadedWorkspacePlugin[],
): Promise<WorkspaceSkill[]> {
  const live = await hx.skills.list();
  const pluginOrigins = new Map<string, ComponentOrigin>();
  const unloaded: WorkspaceSkill[] = [];
  for (const loaded of plugins) {
    for (const component of loaded.ir.components) {
      if (component.kind !== 'skill' && component.kind !== 'command') {
        continue;
      }
      const spec = component.spec as SkillSpec | CommandSpec;
      const fullName = 'id' in spec ? spec.id : `${loaded.record.name}:${component.source.pointer}`;
      const origin: ComponentOrigin = {
        kind: 'plugin',
        pluginName: loaded.record.name,
        status: component.status,
        ...(component.inertReason !== undefined ? { inertReason: component.inertReason } : {}),
      };
      if (component.status === 'native') {
        pluginOrigins.set(fullName, origin);
      } else {
        unloaded.push({ name: fullName, description: '', origin });
      }
    }
  }
  return [
    ...live.map((skill) => ({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      origin: pluginOrigins.get(skill.name) ?? { kind: 'workspace' },
    })),
    ...unloaded,
  ];
}
