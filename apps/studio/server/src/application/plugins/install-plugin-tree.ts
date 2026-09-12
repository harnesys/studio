import { cpSync, existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import type { PluginMutationResponse } from '@harnesys/studio-shared';
import type { PluginName } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import { removePluginPath } from '../../adapters/plugin-git.adapter.ts';
import {
  materializeSource,
  type RemoteCatalogSource,
} from '../../adapters/plugin-source.adapter.ts';
import {
  pluginDataPath,
  pluginInstallPath,
  pluginsPath,
} from '../../adapters/store/studio-layout.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { ConflictError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { prepareCatalogCheckout } from './materialize-catalog-plugin.ts';
import { toPluginSummary } from './plugin-summary.ts';

export type TreeInstallArgs = {
  from: string;
  displaySource: string;
  revision?: string;
  trust: boolean;
  registryId?: string;
  catalogPluginName?: string;
  preferredName: string;
  marketplaceRoot?: string;
};

export type MaterializedInstallArgs = {
  installSource: RemoteCatalogSource;
  displaySource: string;
  trust: boolean;
  registryId: string;
  catalogPluginName: string;
  marketplaceRoot: string;
};

/**
 * Turns a plugin tree (plain copy or materialized npm/archive source) into an
 * install record: conflict check, catalog manifest materialization, load, rename
 * to the manifest name, record upsert. Failed installs clean up after themselves.
 */
export class PluginTreeInstaller {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly home: string,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  /**
   * npm/archive sources materialize into a staged directory (no git), then follow
   * the copied-tree install path. The revision keys the record: npm package
   * version or archive digest(12).
   */
  async fromMaterialized(args: MaterializedInstallArgs): Promise<PluginMutationResponse> {
    const staged = `${pluginInstallPath(this.home, args.catalogPluginName)}__materialize`;
    await removePluginPath(staged).catch(() => undefined);
    try {
      const materialized = await materializeSource({ source: args.installSource, dest: staged });
      return await this.fromCopiedTree({
        from: staged,
        displaySource: args.displaySource,
        revision: materialized.revision ?? 'unknown',
        trust: args.trust,
        registryId: args.registryId,
        catalogPluginName: args.catalogPluginName,
        preferredName: args.catalogPluginName,
        marketplaceRoot: args.marketplaceRoot,
      });
    } finally {
      await removePluginPath(staged).catch(() => undefined);
    }
  }

  async fromCopiedTree(args: TreeInstallArgs): Promise<PluginMutationResponse> {
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
      const result = await this.finalize({
        checkout,
        displaySource: args.displaySource,
        revision: args.revision ?? 'marketplace',
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

  async finalize(args: {
    checkout: string;
    displaySource: string;
    revision: string;
    trust: boolean;
    registryId?: string;
    catalogPluginName?: string;
    onRename: (next: string) => void;
    setInstalledName: (name: PluginName) => void;
  }): Promise<PluginMutationResponse> {
    let checkout = args.checkout;
    let loaded = await loadPluginIrFromDirectory({
      root: checkout,
      pluginData: pluginDataPath(this.home, repoNameFromPath(checkout)),
    });
    const name = loaded.ir.identity.name;
    const finalDest = pluginInstallPath(this.home, name);
    if (checkout !== finalDest) {
      if (this.plugins.findByName(name) || existsSync(finalDest)) {
        throw new ConflictError(`plugin ${name} already exists`);
      }
      await rename(checkout, finalDest);
      checkout = finalDest;
      args.onRename(finalDest);
      loaded = await loadPluginIrFromDirectory({
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
      plugin: toPluginSummary(saved, loaded.ir),
      diagnostics: loaded.diagnostics,
    };
  }
}

function repoNameFromPath(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? 'plugin';
}
