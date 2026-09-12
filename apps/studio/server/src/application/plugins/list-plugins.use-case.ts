import { existsSync } from 'node:fs';
import type { PluginListItem, PluginSummary } from '@harnesys/studio-shared';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { toPluginSummary } from './plugin-summary.ts';

export type ListPluginsInput = {
  execute(): Promise<PluginListItem[]>;
};

export class ListPluginsUseCase implements ListPluginsInput {
  constructor(private readonly plugins: PluginRepository) {}

  async execute(): Promise<PluginListItem[]> {
    const records = this.plugins.list();
    return await Promise.all(records.map((record) => loadListItem(record)));
  }
}

async function loadListItem(record: PluginInstallRecord): Promise<PluginListItem> {
  if (!existsSync(record.path)) {
    return {
      plugin: unloadedSummary(record),
      diagnostics: [
        {
          level: 'error',
          code: 'invalid_component',
          message: `plugin checkout not found: ${record.path}`,
          path: record.path,
        },
      ],
    };
  }
  try {
    const loaded = await loadPluginIrFromDirectory({
      root: record.path,
      pluginData: record.dataPath,
    });
    return {
      plugin: toPluginSummary(record, loaded.ir),
      diagnostics: loaded.diagnostics,
    };
  } catch (err) {
    return {
      plugin: unloadedSummary(record),
      diagnostics: [
        {
          level: 'error',
          code: 'invalid_component',
          message: err instanceof Error ? err.message : 'plugin load failed',
          path: record.path,
        },
      ],
    };
  }
}

function unloadedSummary(record: PluginInstallRecord): PluginSummary {
  return {
    name: record.name,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    trusted: record.trusted,
    enabledWorkspaceIds: record.enabledWorkspaceIds,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    skillCount: 0,
    hookCount: 0,
    mcpServerCount: 0,
    agentCount: 0,
    commandCount: 0,
    lspServerCount: 0,
    ...(record.registryId ? { registryId: record.registryId } : {}),
    ...(record.catalogPluginName ? { catalogPluginName: record.catalogPluginName } : {}),
  };
}
