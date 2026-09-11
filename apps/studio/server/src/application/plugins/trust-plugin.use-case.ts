import type { PluginName, PluginRecord } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';

export type TrustPluginRequest = {
  name: PluginName;
  trusted: boolean;
};

export type TrustPluginInput = {
  execute(request: TrustPluginRequest): Promise<PluginRecord>;
};

export class TrustPluginUseCase implements TrustPluginInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: TrustPluginRequest): Promise<PluginRecord> {
    const saved = this.plugins.setTrusted(request.name, request.trusted);
    await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
    return saved;
  }
}
