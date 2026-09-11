import type { PluginSummary } from '@harnesys/studio-shared';
import type { Plugin } from 'harnesys';
import type { PluginInstallRecord } from '../../domain/plugin.port.ts';

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
  if (record.registryId) {
    summary.registryId = record.registryId;
  }
  if (record.catalogPluginName) {
    summary.catalogPluginName = record.catalogPluginName;
  }
  if (plugin.manifest.version !== undefined) {
    summary.version = plugin.manifest.version;
  }
  if (plugin.manifest.description !== undefined) {
    summary.description = plugin.manifest.description;
  }
  return summary;
}
