import type { PluginSummary } from '@harnesys/studio-shared';
import type { PluginIr, PluginKind } from 'harnesys';
import type { PluginInstallRecord } from '../../domain/plugin.port.ts';

export function toPluginSummary(record: PluginInstallRecord, ir: PluginIr): PluginSummary {
  const summary: PluginSummary = {
    name: record.name,
    sourceFormat: ir.sourceFormat,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    trusted: record.trusted,
    enabledWorkspaceIds: record.enabledWorkspaceIds,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    skillCount: countKind(ir, 'skill'),
    hookCount: countKind(ir, 'hook'),
    mcpServerCount: countKind(ir, 'mcp-server'),
    agentCount: countKind(ir, 'agent'),
    commandCount: countKind(ir, 'command'),
    lspServerCount: countKind(ir, 'lsp-server'),
  };
  if (record.registryId) {
    summary.registryId = record.registryId;
  }
  if (record.catalogPluginName) {
    summary.catalogPluginName = record.catalogPluginName;
  }
  if (ir.identity.version !== undefined) {
    summary.version = ir.identity.version;
  }
  if (ir.identity.description !== undefined) {
    summary.description = ir.identity.description;
  }
  return summary;
}

function countKind(ir: PluginIr, kind: PluginKind): number {
  return ir.components.filter((component) => component.kind === kind).length;
}
