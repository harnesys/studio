import type { PluginName } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces, type LspByWorkspace } from './invalidate-plugin-workspaces.ts';
export type ApproveServerRequest = {
  workspaceId: string;
  name: PluginName;
  serverId: string;
};
export type ApproveServerInput = {
  execute(request: ApproveServerRequest): Promise<PluginInstallRecord>;
};
export class ApproveServerUseCase implements ApproveServerInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly lspByWorkspace?: LspByWorkspace,
  ) {}
  async execute(request: ApproveServerRequest): Promise<PluginInstallRecord> {
    const current = this.plugins.findByName(request.workspaceId, request.name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    this.plugins.approveServer(request.workspaceId, request.name, request.serverId);
    await invalidatePluginWorkspaces(
      this.workspaceHarnesys,
      [request.workspaceId],
      this.lspByWorkspace,
    );
    return current;
  }
}
