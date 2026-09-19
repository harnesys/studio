import { existsSync } from 'node:fs';
import type { PluginListItem, PluginSummary } from '@harnesys/studio-shared';
import type { PluginIr } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { applyGrantGating } from './plugin-grant-gate.ts';
import { toPluginSummary } from './plugin-summary.ts';

export type ListPluginsRequest = {
  workspaceId: string;
};

export type ListPluginsInput = {
  execute(request: ListPluginsRequest): Promise<PluginListItem[]>;
};

export class ListPluginsUseCase implements ListPluginsInput {
  constructor(private readonly plugins: PluginRepository) {}

  async execute(request: ListPluginsRequest): Promise<PluginListItem[]> {
    const records = this.plugins.list(request.workspaceId);
    return await Promise.all(
      records.map((record) => loadListItem(record, request.workspaceId, this.plugins)),
    );
  }
}

async function loadListItem(
  record: PluginInstallRecord,
  workspaceId: string,
  plugins: PluginRepository,
): Promise<PluginListItem> {
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
      plugin: toPluginSummary(record, gatedIr(record, loaded.ir, workspaceId, plugins)),
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

function gatedIr(
  record: PluginInstallRecord,
  raw: PluginIr,
  workspaceId: string,
  plugins: PluginRepository,
): PluginIr {
  const approved = new Set(plugins.approvals(workspaceId, record.name));
  return applyGrantGating(raw, record.grants, approved);
}

function unloadedSummary(record: PluginInstallRecord): PluginSummary {
  return {
    workspaceId: record.workspaceId,
    name: record.name,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    format: record.format,
    grants: record.grants,
    options: record.options,
    components: [],
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
