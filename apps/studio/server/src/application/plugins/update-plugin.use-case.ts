import { existsSync } from 'node:fs';
import type { PluginMutationResponse, PluginName } from '@harnesys/studio-shared';
import { loadPluginFromDirectory } from 'harnesys/adapters/node';
import { updatePluginCheckout } from '../../adapters/plugin-git.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { toPluginSummary } from './plugin-summary.ts';

export type UpdatePluginRequest = {
  name: PluginName;
  ref?: string;
};

export type UpdatePluginResponse = PluginMutationResponse;

export type UpdatePluginInput = {
  execute(request: UpdatePluginRequest): Promise<UpdatePluginResponse>;
};

export class UpdatePluginUseCase implements UpdatePluginInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: UpdatePluginRequest): Promise<UpdatePluginResponse> {
    const current = this.plugins.findByName(request.name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    if (!existsSync(current.path)) {
      throw new NotFoundError('plugin checkout not found');
    }

    const checkout = await updatePluginCheckout({
      path: current.path,
      ...(request.ref !== undefined ? { ref: request.ref } : {}),
    });
    const loaded = await loadPluginFromDirectory({
      root: current.path,
      pluginData: current.dataPath,
    });
    const now = new Date().toISOString();
    const saved = this.plugins.upsert({
      ...current,
      revision: checkout.revision,
      updatedAt: now,
    });
    await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
    return {
      plugin: toPluginSummary(saved, loaded.plugin),
      diagnostics: loaded.diagnostics,
    };
  }
}
