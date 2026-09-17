import type { PluginName } from '@harnesys/studio-shared';
import { removePluginPath } from '../../adapters/plugin-git.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { ConflictError, NotFoundError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { findDependantNames } from './resolve-dependencies.ts';

export type RemovePluginRequest = {
  workspaceId: string;
  name: PluginName;
  deleteData?: boolean;
};

export type RemovePluginInput = {
  execute(request: RemovePluginRequest): Promise<void>;
};

export class RemovePluginUseCase implements RemovePluginInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: RemovePluginRequest): Promise<void> {
    const current = this.plugins.findByName(request.workspaceId, request.name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    const dependants = findDependantNames(this.plugins, request.workspaceId, request.name);
    if (dependants.length > 0) {
      throw new ConflictError(`plugin ${request.name} is required by: ${dependants.join(', ')}`);
    }
    this.plugins.delete(request.workspaceId, request.name);
    // Shared host checkout: only remove FS when no other node still references it.
    if (!this.plugins.findByNameAny(request.name)) {
      await removePluginPath(current.path);
      if (request.deleteData === true) {
        await removePluginPath(current.dataPath);
      }
    }
    await invalidatePluginWorkspaces(this.workspaceHarnesys, [request.workspaceId]);
  }
}
