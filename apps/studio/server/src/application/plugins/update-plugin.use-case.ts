import { cpSync, existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PluginMutationResponse, PluginName } from '@harnesys/studio-shared';
import { loadPluginFromDirectory } from 'harnesys/adapters/node';
import { removePluginPath, updatePluginCheckout } from '../../adapters/plugin-git.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import type { PluginRegistryRepository } from '../../domain/plugin-registry.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { prepareCatalogCheckout } from './materialize-catalog-plugin.ts';
import { toPluginSummary } from './plugin-summary.ts';
import type { SyncPluginRegistryInput } from './sync-plugin-registry.use-case.ts';

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
    private readonly registries?: PluginRegistryRepository,
    private readonly syncRegistry?: SyncPluginRegistryInput,
  ) {}

  async execute(request: UpdatePluginRequest): Promise<UpdatePluginResponse> {
    const current = this.plugins.findByName(request.name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    if (!existsSync(current.path)) {
      throw new NotFoundError('plugin checkout not found');
    }

    if (!existsSync(join(current.path, '.git'))) {
      return this.updateNonGit(current, request);
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

  /**
   * Catalog installs with a `relative` source are plain copies of the marketplace
   * checkout (no .git). Update = sync the registry, re-copy the entry, re-materialize
   * the manifest. Trust and workspace enables are preserved.
   */
  private async updateNonGit(
    current: PluginInstallRecord,
    request: UpdatePluginRequest,
  ): Promise<UpdatePluginResponse> {
    if (request.ref !== undefined) {
      throw new ValidationError('ref is only supported for git-installed plugins');
    }
    if (!current.registryId || !current.catalogPluginName) {
      throw new ValidationError(
        'plugin checkout is not a git repository and has no registry origin; reinstall it',
      );
    }
    if (!this.registries || !this.syncRegistry) {
      throw new ValidationError('plugin registries are not configured');
    }
    await this.syncRegistry.execute(current.registryId);
    const registry = this.registries.findById(current.registryId);
    if (!registry) {
      throw new NotFoundError(`registry ${current.registryId} not found`);
    }
    const entry = this.registries.findCatalogEntry(current.registryId, current.catalogPluginName);
    if (!entry) {
      throw new NotFoundError(
        `plugin ${current.catalogPluginName} not found in registry ${current.registryId}`,
      );
    }
    if (!entry.installable || !entry.installSource) {
      throw new ValidationError(entry.unsupportedReason ?? 'plugin source is not installable');
    }
    if (entry.installSource.type !== 'relative') {
      throw new ValidationError(
        `catalog source "${entry.installSource.type}" expects a git checkout; reinstall the plugin`,
      );
    }

    const from = resolve(registry.path, entry.installSource.path);
    if (!from.startsWith(`${resolve(registry.path)}/`) && from !== resolve(registry.path)) {
      throw new ValidationError(
        `relative plugin path escapes marketplace: ${entry.installSource.path}`,
      );
    }
    if (!existsSync(from)) {
      throw new ValidationError(`relative plugin path missing: ${entry.installSource.path}`);
    }

    const staged = `${current.path}__update`;
    await removePluginPath(staged).catch(() => undefined);
    let extraDiagnostics: Awaited<ReturnType<typeof prepareCatalogCheckout>> = [];
    try {
      cpSync(from, staged, { recursive: true });
      extraDiagnostics = await prepareCatalogCheckout(
        staged,
        registry.path,
        current.catalogPluginName,
      );
      const loaded = await loadPluginFromDirectory({
        root: staged,
        pluginData: current.dataPath,
      });
      await removePluginPath(current.path);
      await rename(staged, current.path);
      const now = new Date().toISOString();
      const saved = this.plugins.upsert({ ...current, updatedAt: now });
      await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
      return {
        plugin: toPluginSummary(saved, loaded.plugin),
        diagnostics: [...extraDiagnostics, ...loaded.diagnostics],
      };
    } catch (err) {
      await removePluginPath(staged).catch(() => undefined);
      throw err;
    }
  }
}
