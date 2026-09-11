import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import type { PluginMutationResponse, PluginSummary } from '@harnesys/studio-shared';
import type { Plugin, PluginName } from 'harnesys';
import { loadPluginFromDirectory } from 'harnesys/adapters/node';
import {
  clonePlugin,
  removePluginPath,
  resolveGitSource,
} from '../../adapters/plugin-git.adapter.ts';
import { pluginDataPath, pluginInstallPath } from '../../adapters/store/studio-layout.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { ConflictError, ValidationError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';

export type InstallPluginRequest = {
  source: string;
  trust?: boolean;
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
  ) {}

  async execute(request: InstallPluginRequest): Promise<InstallPluginResponse> {
    const source = request.source.trim();
    if (source.length === 0) {
      throw new ValidationError('source is required');
    }
    const resolved = resolveGitSource(source);
    const repoName = repoNameFromSource(resolved);
    const dest = pluginInstallPath(this.home, repoName);
    if (this.plugins.findByName(repoName) || existsSync(dest)) {
      throw new ConflictError(`plugin ${repoName} already exists`);
    }

    const cloned = await clonePlugin({ source: resolved, dest });
    let checkout = dest;
    let installedName: PluginName | undefined;
    try {
      let loaded = await loadPluginFromDirectory({
        root: checkout,
        pluginData: pluginDataPath(this.home, repoName),
      });
      const name = loaded.plugin.manifest.name;
      if (name !== repoName) {
        const finalDest = pluginInstallPath(this.home, name);
        if (this.plugins.findByName(name) || existsSync(finalDest)) {
          throw new ConflictError(`plugin ${name} already exists`);
        }
        await rename(checkout, finalDest);
        checkout = finalDest;
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
        source,
        revision: cloned.revision,
        path: checkout,
        dataPath,
        trusted: request.trust === true,
        enabledWorkspaceIds: [],
        installedAt: now,
        updatedAt: now,
      };
      installedName = name;
      const saved = this.plugins.upsert(record);
      await mkdir(dataPath, { recursive: true });
      await invalidatePluginWorkspaces(this.workspaceHarnesys, saved.enabledWorkspaceIds);
      return {
        plugin: toPluginSummary(saved, loaded.plugin),
        diagnostics: loaded.diagnostics,
      };
    } catch (err) {
      if (installedName !== undefined) {
        this.plugins.delete(installedName);
      }
      await removePluginPath(checkout);
      throw err;
    }
  }
}

export function toPluginSummary(record: PluginInstallRecord, plugin: Plugin): PluginSummary {
  const summary: PluginSummary = {
    name: record.name,
    sourceFormat: plugin.sourceFormat,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    trusted: record.trusted,
    enabledWorkspaceIds: record.enabledWorkspaceIds,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    skillCount: plugin.skills.length,
    hookCount: plugin.hooks.length,
    mcpServerCount: plugin.mcpServers.length,
    agentCount: plugin.agents.length,
    commandCount: plugin.commands.length,
  };
  if (plugin.manifest.version !== undefined) {
    summary.version = plugin.manifest.version;
  }
  if (plugin.manifest.description !== undefined) {
    summary.description = plugin.manifest.description;
  }
  return summary;
}

function repoNameFromSource(resolved: string): string {
  const trimmed = resolved.replace(/\/+$/, '').replace(/\.git$/i, '');
  const segment = trimmed.split(/[/:]/).filter(Boolean).at(-1);
  if (!segment) {
    throw new ValidationError('invalid git source');
  }
  return segment;
}
