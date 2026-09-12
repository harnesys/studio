import { cpSync, existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { PluginDiagnostic, PluginMutationResponse, PluginName } from '@harnesys/studio-shared';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { CatalogEntry } from 'harnesys/plugins-catalog';
import { removePluginPath, updatePluginCheckout } from '../../adapters/plugin-git.adapter.ts';
import {
  installPluginDependencies,
  materializeSource,
  type RemoteCatalogSource,
} from '../../adapters/plugin-source.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import type {
  PluginRegistryRecord,
  PluginRegistryRepository,
} from '../../domain/plugin-registry.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import {
  findCatalogEntryWithRenames,
  prepareCatalogCheckout,
  readPluginManifestVersion,
  resolveCatalogEntryVersion,
} from './materialize-catalog-plugin.ts';
import { toPluginSummary } from './plugin-summary.ts';
import { findDependantNames } from './resolve-dependencies.ts';
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
    const dependants = findDependantNames(this.plugins, request.name);
    if (dependants.length > 0) {
      throw new ConflictError(`plugin ${request.name} is required by: ${dependants.join(', ')}`);
    }

    if (!existsSync(join(current.path, '.git'))) {
      return this.updateNonGit(current, request);
    }

    const checkout = await updatePluginCheckout({
      path: current.path,
      ...(request.ref !== undefined ? { ref: request.ref } : {}),
    });
    const loaded = await loadPluginIrFromDirectory({
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
      plugin: toPluginSummary(saved, loaded.ir),
      diagnostics: loaded.diagnostics,
    };
  }

  /**
   * Catalog installs without .git: `relative` (plain copy of the marketplace
   * checkout), `npm` and `archive` (materialized trees). Update = sync the
   * registry, re-resolve the entry (following `renames`), re-materialize,
   * re-materialize the manifest. Trust and workspace enables are preserved;
   * PLUGIN_DATA (dataPath) is never touched. Materialized sources swap into a
   * version-keyed cache dir `plugins/<name>/<revision>`; the record revision is
   * cleaned to the resolved version.
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
    const entry = findCatalogEntryWithRenames(
      this.registries,
      current.registryId,
      current.catalogPluginName,
    );
    if (!entry) {
      throw new NotFoundError(
        `plugin ${current.catalogPluginName} not found in registry ${current.registryId}`,
      );
    }
    if (!entry.installable || !entry.installSource) {
      throw new ValidationError(entry.unsupportedReason ?? 'plugin source is not installable');
    }
    if (entry.installSource.type === 'npm' || entry.installSource.type === 'archive') {
      return this.updateMaterialized(current, {
        registry,
        entry,
        source: entry.installSource,
      });
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
    try {
      cpSync(from, staged, { recursive: true });
      const extraDiagnostics = await prepareCatalogCheckout(
        staged,
        registry.path,
        entry.pluginName,
      );
      const depsDiagnostics = await installCheckoutDependencies(staged);
      const loaded = await loadPluginIrFromDirectory({
        root: staged,
        pluginData: current.dataPath,
      });
      await removePluginPath(current.path);
      await rename(staged, current.path);
      const now = new Date().toISOString();
      const saved = this.plugins.upsert({
        ...current,
        catalogPluginName: entry.pluginName,
        updatedAt: now,
      });
      await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
      return {
        plugin: toPluginSummary(saved, loaded.ir),
        diagnostics: [...extraDiagnostics, ...depsDiagnostics, ...loaded.diagnostics],
      };
    } catch (err) {
      await removePluginPath(staged).catch(() => undefined);
      throw err;
    }
  }

  /** npm/archive: re-materialize into a version-keyed cache dir and swap. */
  private async updateMaterialized(
    current: PluginInstallRecord,
    args: {
      registry: PluginRegistryRecord;
      entry: CatalogEntry;
      source: RemoteCatalogSource;
    },
  ): Promise<UpdatePluginResponse> {
    const staged = `${current.path}__update`;
    await removePluginPath(staged).catch(() => undefined);
    try {
      const materialized = await materializeSource({ source: args.source, dest: staged });
      const extraDiagnostics = await prepareCatalogCheckout(
        staged,
        args.registry.path,
        args.entry.pluginName,
      );
      const version = resolveCatalogEntryVersion({
        entry: args.entry,
        manifestVersion: readPluginManifestVersion(staged),
        registryRevision: args.registry.revision,
        sourceRevision: materialized.revision,
      });
      const depsDiagnostics = await installCheckoutDependencies(staged);
      const loaded = await loadPluginIrFromDirectory({
        root: staged,
        pluginData: current.dataPath,
      });
      const nextPath = versionedInstallPath(current.path, current.name, version);
      await removePluginPath(current.path);
      await mkdir(dirname(nextPath), { recursive: true });
      await rename(staged, nextPath);
      const now = new Date().toISOString();
      const saved = this.plugins.upsert({
        ...current,
        path: nextPath,
        revision: version,
        catalogPluginName: args.entry.pluginName,
        updatedAt: now,
      });
      await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
      return {
        plugin: toPluginSummary(saved, loaded.ir),
        diagnostics: [...extraDiagnostics, ...depsDiagnostics, ...loaded.diagnostics],
      };
    } catch (err) {
      await removePluginPath(staged).catch(() => undefined);
      throw err;
    }
  }
}

/** Version-keyed cache dir `plugins/<name>/<revision>`; flat installs nest under their name dir. */
function versionedInstallPath(currentPath: string, name: string, version: string): string {
  const versionedRoot = basename(currentPath) === name ? currentPath : dirname(currentPath);
  return join(versionedRoot, version);
}

/** Lockfile-bearing checkouts get `bun install --ignore-scripts`; failure is non-blocking. */
async function installCheckoutDependencies(checkout: string): Promise<PluginDiagnostic[]> {
  const ok = await installPluginDependencies(checkout).catch(() => false);
  if (ok) {
    return [];
  }
  return [
    {
      level: 'warning',
      code: 'dependency_unsatisfied',
      message:
        'bun install --ignore-scripts failed or timed out; plugin node dependencies are not installed',
      path: checkout,
    },
  ];
}
