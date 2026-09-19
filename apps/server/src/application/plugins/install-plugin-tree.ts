import { cpSync, existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import type { PluginDiagnostic, PluginMutationResponse } from '@harnesys/studio-shared';
import type { PluginName } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import { removePluginPath } from '../../adapters/plugin-git.adapter.ts';
import {
  materializeSource,
  type RemoteCatalogSource,
} from '../../adapters/plugin-source.adapter.ts';
import {
  workspacePluginDataPath,
  workspacePluginInstallPath,
  workspacePluginsPath,
} from '../../adapters/store/studio-layout.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { ConflictError, NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { invalidatePluginWorkspaces, type LspByWorkspace } from './invalidate-plugin-workspaces.ts';
import { prepareCatalogCheckout } from './materialize-catalog-plugin.ts';
import { toPluginSummary } from './plugin-summary.ts';
export type TreeInstallArgs = {
  workspaceId: string;
  from: string;
  displaySource: string;
  revision?: string;
  registryId?: string;
  catalogPluginName?: string;
  preferredName: string;
  marketplaceRoot?: string;
};
export type MaterializedInstallArgs = {
  workspaceId: string;
  installSource: RemoteCatalogSource;
  displaySource: string;
  registryId: string;
  catalogPluginName: string;
  marketplaceRoot: string;
};
export class PluginTreeInstaller {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly lspByWorkspace?: LspByWorkspace,
  ) {}
  async fromMaterialized(args: MaterializedInstallArgs): Promise<PluginMutationResponse> {
    const root = this.workspacePath(args.workspaceId);
    const staged = `${workspacePluginInstallPath(root, args.catalogPluginName)}__materialize`;
    await removePluginPath(staged).catch(() => undefined);
    try {
      const materialized = await materializeSource({ source: args.installSource, dest: staged });
      return await this.fromCopiedTree({
        workspaceId: args.workspaceId,
        from: staged,
        displaySource: args.displaySource,
        revision: materialized.revision ?? 'unknown',
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
    const root = this.workspacePath(args.workspaceId);
    const dest = workspacePluginInstallPath(root, args.preferredName);
    if (this.plugins.findByName(args.workspaceId, args.preferredName)) {
      throw new ConflictError(`plugin ${args.preferredName} already exists`);
    }
    await mkdir(workspacePluginsPath(root), { recursive: true });
    let checkout = dest;
    let copied = false;
    if (!existsSync(dest)) {
      cpSync(args.from, dest, { recursive: true });
      copied = true;
    }
    let installedName: PluginName | undefined;
    try {
      const extraDiagnostics =
        args.marketplaceRoot && args.catalogPluginName
          ? await prepareCatalogCheckout(checkout, args.marketplaceRoot, args.catalogPluginName)
          : [];
      const copiedFrom = checkout;
      const result = await this.finalize({
        workspaceId: args.workspaceId,
        checkout,
        displaySource: args.displaySource,
        revision: args.revision ?? 'marketplace',
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
        diagnostics: rewriteStagedDiagPaths(
          [...extraDiagnostics, ...result.diagnostics],
          copiedFrom,
          checkout,
        ),
      };
    } catch (err) {
      if (installedName !== undefined) {
        this.plugins.delete(args.workspaceId, installedName);
      }
      if (copied) {
        await removePluginPath(checkout);
      }
      throw err;
    }
  }
  async finalize(args: {
    workspaceId: string;
    checkout: string;
    displaySource: string;
    revision: string;
    registryId?: string;
    catalogPluginName?: string;
    onRename: (next: string) => void;
    setInstalledName: (name: PluginName) => void;
  }): Promise<PluginMutationResponse> {
    const root = this.workspacePath(args.workspaceId);
    let checkout = args.checkout;
    let loaded = await loadPluginIrFromDirectory({
      root: checkout,
      pluginData: workspacePluginDataPath(root, repoNameFromPath(checkout)),
    });
    const name = loaded.ir.identity.name;
    const finalDest = workspacePluginInstallPath(root, name);
    if (checkout !== finalDest) {
      if (this.plugins.findByName(args.workspaceId, name)) {
        throw new ConflictError(`plugin ${name} already exists`);
      }
      if (!existsSync(finalDest)) {
        await rename(checkout, finalDest);
      } else {
        await removePluginPath(checkout);
      }
      checkout = finalDest;
      args.onRename(finalDest);
      loaded = await loadPluginIrFromDirectory({
        root: checkout,
        pluginData: workspacePluginDataPath(root, name),
      });
    } else if (this.plugins.findByName(args.workspaceId, name)) {
      throw new ConflictError(`plugin ${name} already exists`);
    }
    const now = new Date().toISOString();
    const dataPath = workspacePluginDataPath(root, name);
    const record: PluginInstallRecord = {
      workspaceId: args.workspaceId,
      name,
      source: args.displaySource,
      revision: args.revision,
      path: checkout,
      dataPath,
      format: loaded.ir.sourceFormat,
      grants: {},
      options: {},
      installedAt: now,
      updatedAt: now,
      ...(args.registryId ? { registryId: args.registryId } : {}),
      ...(args.catalogPluginName ? { catalogPluginName: args.catalogPluginName } : {}),
    };
    args.setInstalledName(name);
    const saved = this.plugins.upsert(record);
    await mkdir(dataPath, { recursive: true });
    await invalidatePluginWorkspaces(
      this.workspaceHarnesys,
      [saved.workspaceId],
      this.lspByWorkspace,
    );
    return {
      plugin: toPluginSummary(saved, loaded.ir),
      diagnostics: loaded.diagnostics,
    };
  }
  private workspacePath(workspaceId: string): string {
    const row = this.workspaces.findById(workspaceId);
    if (!row) {
      throw new NotFoundError('workspace not found');
    }
    return row.path;
  }
}
function repoNameFromPath(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? 'plugin';
}
function rewriteStagedDiagPaths(
  diagnostics: PluginDiagnostic[],
  staged: string,
  final: string,
): PluginDiagnostic[] {
  if (staged === final) {
    return diagnostics;
  }
  return diagnostics.map((d) =>
    d.path?.startsWith(staged) ? { ...d, path: `${final}${d.path.slice(staged.length)}` } : d,
  );
}
