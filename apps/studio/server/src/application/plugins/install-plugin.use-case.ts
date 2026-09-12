import { cpSync, existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PluginMutationResponse } from '@harnesys/studio-shared';
import type { PluginName } from 'harnesys';
import type { CatalogInstallSource } from 'harnesys/plugins-catalog';
import {
  clonePlugin,
  removePluginPath,
  resolveGitSource,
} from '../../adapters/plugin-git.adapter.ts';
import { pluginInstallPath } from '../../adapters/store/studio-layout.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import type { PluginRegistryRepository } from '../../domain/plugin-registry.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { type MaterializedInstallArgs, PluginTreeInstaller } from './install-plugin-tree.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { findCatalogEntryWithRenames } from './materialize-catalog-plugin.ts';
import { resolvePluginDependencies } from './resolve-dependencies.ts';

export type InstallPluginRequest = {
  source?: string;
  path?: string;
  ref?: string;
  registryId?: string;
  catalogPluginName?: string;
  pluginName?: string;
};

export type InstallPluginResponse = PluginMutationResponse;

export type InstallPluginInput = {
  execute(request: InstallPluginRequest): Promise<InstallPluginResponse>;
};

export class InstallPluginUseCase implements InstallPluginInput {
  private readonly tree: PluginTreeInstaller;

  constructor(
    private readonly plugins: PluginRepository,
    private readonly home: string,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly registries?: PluginRegistryRepository,
  ) {
    this.tree = new PluginTreeInstaller(plugins, home, workspaceHarnesys);
  }

  async execute(request: InstallPluginRequest): Promise<InstallPluginResponse> {
    const result = await this.install(request);
    return this.settleDependencies(result);
  }

  private install(request: InstallPluginRequest): Promise<InstallPluginResponse> {
    if (request.registryId && request.pluginName) {
      return this.installFromCatalog(request.registryId, request.pluginName);
    }
    const source = request.source?.trim() ?? '';
    if (source.length === 0) {
      throw new ValidationError('source is required');
    }
    return this.installFromGit({
      source,
      path: request.path?.trim() || undefined,
      ref: request.ref?.trim() || undefined,
      registryId: request.registryId,
      catalogPluginName: request.catalogPluginName,
    });
  }

  /**
   * Post-install dependency pass: resolve declared dependencies against the
   * catalogs, cascade the parent's workspace enables onto installed deps, and
   * surface cycles/unsatisfied ranges as diagnostics. Install is not rolled
   * back on unsatisfied dependencies.
   */
  private async settleDependencies(result: InstallPluginResponse): Promise<InstallPluginResponse> {
    const record = this.plugins.findByName(result.plugin.name);
    if (!record) {
      return result;
    }
    const resolution = await resolvePluginDependencies(record, this.registries, this.plugins);
    for (const workspaceId of record.enabledWorkspaceIds) {
      for (const dep of resolution.dependencies) {
        if (this.plugins.findByName(dep.name)) {
          this.plugins.setWorkspaceEnabled(dep.name, workspaceId, true);
        }
      }
    }
    await invalidatePluginWorkspaces(this.workspaceHarnesys, record.enabledWorkspaceIds);
    if (resolution.diagnostics.length === 0) {
      return result;
    }
    return {
      plugin: result.plugin,
      diagnostics: [...result.diagnostics, ...resolution.diagnostics],
    };
  }

  private installFromCatalog(
    registryId: string,
    pluginName: string,
  ): Promise<InstallPluginResponse> {
    if (!this.registries) {
      throw new ValidationError('plugin registries are not configured');
    }
    const registry = this.registries.findById(registryId);
    if (!registry) {
      throw new NotFoundError(`registry ${registryId} not found`);
    }
    const entry = findCatalogEntryWithRenames(this.registries, registryId, pluginName);
    if (!entry) {
      throw new NotFoundError(`plugin ${pluginName} not found in registry ${registryId}`);
    }
    if (!entry.installable || !entry.installSource) {
      throw new ValidationError(entry.unsupportedReason ?? 'plugin source is not installable');
    }
    return this.installFromCatalogSource({
      installSource: entry.installSource,
      marketplaceRoot: registry.path,
      displaySource: `${entry.pluginName}@${registry.name}`,
      registryId,
      catalogPluginName: entry.pluginName,
    });
  }

  private installFromCatalogSource(args: {
    installSource: CatalogInstallSource;
    marketplaceRoot: string;
    displaySource: string;
    registryId: string;
    catalogPluginName: string;
  }): Promise<InstallPluginResponse> {
    const { installSource } = args;
    if (installSource.type === 'relative') {
      const from = resolve(args.marketplaceRoot, installSource.path);
      const root = resolve(args.marketplaceRoot);
      if (!from.startsWith(`${root}/`) && from !== root) {
        throw new ValidationError(
          `relative plugin path escapes marketplace: ${installSource.path}`,
        );
      }
      if (!existsSync(from)) {
        throw new ValidationError(`relative plugin path missing: ${installSource.path}`);
      }
      return this.tree.fromCopiedTree({
        from,
        displaySource: args.displaySource,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
        preferredName: args.catalogPluginName,
        marketplaceRoot: args.marketplaceRoot,
      });
    }

    if (installSource.type === 'github') {
      return this.installFromGit({
        source: installSource.repo,
        ref: installSource.sha ?? installSource.ref,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
      });
    }

    if (installSource.type === 'url') {
      return this.installFromGit({
        source: installSource.url,
        ref: installSource.sha ?? installSource.ref,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
      });
    }

    if (installSource.type === 'npm' || installSource.type === 'archive') {
      return this.tree.fromMaterialized({
        installSource,
        displaySource: args.displaySource,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
        marketplaceRoot: args.marketplaceRoot,
      } satisfies MaterializedInstallArgs);
    }

    return this.installFromGit({
      source: installSource.url,
      path: installSource.path,
      ref: installSource.sha ?? installSource.ref,
      registryId: args.registryId,
      catalogPluginName: args.catalogPluginName,
    });
  }

  private async installFromGit(args: {
    source: string;
    path?: string;
    ref?: string;
    registryId?: string;
    catalogPluginName?: string;
  }): Promise<InstallPluginResponse> {
    const resolved = resolveGitSource(args.source);
    const repoName = args.catalogPluginName ?? repoNameFromSource(resolved);
    const dest = pluginInstallPath(this.home, repoName);
    if (this.plugins.findByName(repoName) || existsSync(dest)) {
      throw new ConflictError(`plugin ${repoName} already exists`);
    }

    const cloned = await clonePlugin({
      source: resolved,
      dest,
      ...(args.ref ? { ref: args.ref } : {}),
    });
    let checkout = dest;
    let installedName: PluginName | undefined;
    try {
      const pluginRoot = args.path ? join(dest, args.path) : dest;
      if (args.path && !existsSync(pluginRoot)) {
        throw new ValidationError(`subdirectory missing in repo: ${args.path}`);
      }
      if (args.path) {
        const staged = `${dest}__plugin_root`;
        cpSync(pluginRoot, staged, { recursive: true });
        await removePluginPath(dest);
        await rename(staged, dest);
        checkout = dest;
      }
      return await this.tree.finalize({
        checkout,
        displaySource: args.source,
        revision: cloned.revision,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
        onRename: (next) => {
          checkout = next;
        },
        setInstalledName: (name) => {
          installedName = name;
        },
      });
    } catch (err) {
      if (installedName !== undefined) {
        this.plugins.delete(installedName);
      }
      await removePluginPath(checkout);
      throw err;
    }
  }
}

function repoNameFromSource(resolved: string): string {
  const trimmed = resolved.replace(/\/+$/, '').replace(/\.git$/i, '');
  const segment = trimmed.split(/[/:]/).filter(Boolean).at(-1);
  if (!segment) {
    throw new ValidationError('invalid git source');
  }
  return segment;
}
