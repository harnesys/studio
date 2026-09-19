import type { GrantClass, PluginName } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { invalidatePluginWorkspaces, type LspByWorkspace } from './invalidate-plugin-workspaces.ts';
export type SetGrantsRequest = {
  name: PluginName;
  workspaceId: string;
  classes: GrantClass[];
};
export type SetGrantsInput = {
  execute(request: SetGrantsRequest): Promise<PluginInstallRecord>;
};
export class SetGrantsUseCase implements SetGrantsInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly lspByWorkspace?: LspByWorkspace,
  ) {}
  async execute(request: SetGrantsRequest): Promise<PluginInstallRecord> {
    const saved = this.plugins.setGrants(request.workspaceId, request.name, request.classes);
    await invalidatePluginWorkspaces(
      this.workspaceHarnesys,
      [saved.workspaceId],
      this.lspByWorkspace,
    );
    return saved;
  }
}
