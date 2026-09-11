import { cpSync, existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PluginMutationResponse } from '@harnesys/studio-shared';
import type { PluginName } from 'harnesys';
import { loadPluginFromDirectory } from 'harnesys/adapters/node';
import type { CatalogInstallSource } from 'harnesys/plugins-catalog';
import {
  clonePlugin,
  removePluginPath,
  resolveGitSource,
} from '../../adapters/plugin-git.adapter.ts';
import {
  pluginDataPath,
  pluginInstallPath,
  pluginsPath,
} from '../../adapters/store/studio-layout.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import type { PluginRegistryRepository } from '../../domain/plugin-registry.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { prepareCatalogCheckout } from './materialize-catalog-plugin.ts';
import { toPluginSummary } from './plugin-summary.ts';

export type InstallPluginRequest = {
  source?: string;
  path?: string;
  ref?: string;
  trust?: boolean;
  registryId?: string;
  catalogPluginName?: string;
  pluginName?: string;
};

export type InstallPluginResponse = PluginMutationResponse;

export type InstallPluginInput = {
  execute(request: InstallPluginRequest): Promise<InstallPluginResponse>;
};

export class InstallPluginUseCase implements InstallPluginInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly home: string,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly registries?: PluginRegistryRepository,
  ) {}

  execute(request: InstallPluginRequest): Promise<InstallPluginResponse> {
    if (request.registryId && request.pluginName) {
      return this.installFromCatalog(
        request.registryId,
        request.pluginName,
        request.trust === true,
      );
    }
    const source = request.source?.trim() ?? '';
    if (source.length === 0) {
      throw new ValidationError('source is required');
    }
    return this.installFromGit({
      source,
      path: request.path?.trim() || undefined,
      ref: request.ref?.trim() || undefined,
      trust: request.trust === true,
      registryId: request.registryId,
      catalogPluginName: request.catalogPluginName,
    });
  }

  private installFromCatalog(
    registryId: string,
    pluginName: string,
    trust: boolean,
  ): Promise<InstallPluginResponse> {
    if (!this.registries) {
      throw new ValidationError('plugin registries are not configured');
    }
    const registry = this.registries.findById(registryId);
    if (!registry) {
      throw new NotFoundError(`registry ${registryId} not found`);
    }
    const entry = this.registries.findCatalogEntry(registryId, pluginName);
    if (!entry) {
      throw new NotFoundError(`plugin ${pluginName} not found in registry ${registryId}`);
    }
    if (!entry.installable || !entry.installSource) {
      throw new ValidationError(entry.unsupportedReason ?? 'plugin source is not installable');
    }
    return this.installFromCatalogSource({
      installSource: entry.installSource,
      marketplaceRoot: registry.path,
      displaySource: `${pluginName}@${registry.name}`,
      trust,
      registryId,
      catalogPluginName: pluginName,
    });
  }

  private installFromCatalogSource(args: {
    installSource: CatalogInstallSource;
    marketplaceRoot: string;
    displaySource: string;
    trust: boolean;
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
      return this.installFromCopiedTree({
        from,
        displaySource: args.displaySource,
        trust: args.trust,
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
        trust: args.trust,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
      });
    }

    if (installSource.type === 'url') {
      return this.installFromGit({
        source: installSource.url,
        ref: installSource.sha ?? installSource.ref,
        trust: args.trust,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
      });
    }

    return this.installFromGit({
      source: installSource.url,
      path: installSource.path,
      ref: installSource.sha ?? installSource.ref,
      trust: args.trust,
      registryId: args.registryId,
      catalogPluginName: args.catalogPluginName,
    });
  }

  private async installFromCopiedTree(args: {
    from: string;
    displaySource: string;
    trust: boolean;
    registryId?: string;
    catalogPluginName?: string;
    preferredName: string;
    marketplaceRoot?: string;
  }): Promise<InstallPluginResponse> {
    const dest = pluginInstallPath(this.home, args.preferredName);
    if (this.plugins.findByName(args.preferredName) || existsSync(dest)) {
      throw new ConflictError(`plugin ${args.preferredName} already exists`);
    }
    await mkdir(pluginsPath(this.home), { recursive: true });
    cpSync(args.from, dest, { recursive: true });
    let checkout = dest;
    let installedName: PluginName | undefined;
    try {
      const extraDiagnostics =
        args.marketplaceRoot && args.catalogPluginName
          ? await prepareCatalogCheckout(checkout, args.marketplaceRoot, args.catalogPluginName)
          : [];
      const result = await this.finalizeInstall({
        checkout,
        displaySource: args.displaySource,
        revision: 'marketplace',
        trust: args.trust,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
        onRename: (next) => {
          checkout = next;
        },
        setInstalledName: (name) => {
          installedName = name;
        },
      });
      return {
        plugin: result.plugin,
        diagnostics: [...extraDiagnostics, ...result.diagnostics],
      };
    } catch (err) {
      if (installedName !== undefined) {
        this.plugins.delete(installedName);
      }
      await removePluginPath(checkout);
      throw err;
    }
  }

  private async installFromGit(args: {
    source: string;
    path?: string;
    ref?: string;
    trust: boolean;
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
      return await this.finalizeInstall({
        checkout,
        displaySource: args.source,
        revision: cloned.revision,
        trust: args.trust,
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

  private async finalizeInstall(args: {
    checkout: string;
    displaySource: string;
    revision: string;
    trust: boolean;
    registryId?: string;
    catalogPluginName?: string;
    onRename: (next: string) => void;
    setInstalledName: (name: PluginName) => void;
  }): Promise<InstallPluginResponse> {
    let checkout = args.checkout;
    let loaded = await loadPluginFromDirectory({
      root: checkout,
      pluginData: pluginDataPath(this.home, repoNameFromPath(checkout)),
    });
    const name = loaded.plugin.manifest.name;
    const finalDest = pluginInstallPath(this.home, name);
    if (checkout !== finalDest) {
      if (this.plugins.findByName(name) || existsSync(finalDest)) {
        throw new ConflictError(`plugin ${name} already exists`);
      }
      await rename(checkout, finalDest);
      checkout = finalDest;
      args.onRename(finalDest);
      loaded = await loadPluginFromDirectory({
        root: checkout,
        pluginData: pluginDataPath(this.home, name),
      });
    } else if (this.plugins.findByName(name)) {
      throw new ConflictError(`plugin ${name} already exists`);
    }

    const now = new Date().toISOString();
    const dataPath = pluginDataPath(this.home, name);
    const record: PluginInstallRecord = {
      name,
      source: args.displaySource,
      revision: args.revision,
      path: checkout,
      dataPath,
      trusted: args.trust,
      enabledWorkspaceIds: [],
      installedAt: now,
      updatedAt: now,
      ...(args.registryId ? { registryId: args.registryId } : {}),
      ...(args.catalogPluginName ? { catalogPluginName: args.catalogPluginName } : {}),
    };
    args.setInstalledName(name);
    const saved = this.plugins.upsert(record);
    await mkdir(dataPath, { recursive: true });
    await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
    return {
      plugin: toPluginSummary(saved, loaded.plugin),
      diagnostics: loaded.diagnostics,
    };
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

function repoNameFromPath(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? 'plugin';
}
