import type { PluginName, PluginRecord } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type EnableWorkspacePluginRequest = {
  name: PluginName;
  workspaceId: string;
  enabled: boolean;
};

export type EnableWorkspacePluginInput = {
  execute(request: EnableWorkspacePluginRequest): Promise<PluginRecord>;
};

export class EnableWorkspacePluginUseCase implements EnableWorkspacePluginInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: EnableWorkspacePluginRequest): Promise<PluginRecord> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const saved = this.plugins.setWorkspaceEnabled(
      request.name,
      request.workspaceId,
      request.enabled,
    );
    await this.workspaceHarnesys.invalidate(workspace.id);
    return saved;
  }
}
