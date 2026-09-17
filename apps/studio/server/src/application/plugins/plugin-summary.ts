import type { PluginComponentSummary, PluginSummary } from '@harnesys/studio-shared';
import type { PluginComponent, PluginIr, PluginKind } from 'harnesys';
import type { PluginInstallRecord } from '../../domain/plugin.port.ts';
import { isConfigOptionComponent } from './plugin-user-config.ts';

/** Placeholder for a sensitive option value present in SQLite storage. */
const MASKED_OPTION = '••••••••';

export function toPluginSummary(record: PluginInstallRecord, ir: PluginIr): PluginSummary {
  const summary: PluginSummary = {
    workspaceId: record.workspaceId,
    name: record.name,
    source: record.source,
    revision: record.revision,
    path: record.path,
    dataPath: record.dataPath,
    format: ir.sourceFormat,
    grants: record.grants,
    options: maskedOptions(record, ir),
    components: ir.components.map(toComponentSummary),
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

function toComponentSummary(component: PluginComponent): PluginComponentSummary {
  const item: PluginComponentSummary = {
    kind: component.kind,
    status: component.status,
    source: component.source,
  };
  if (component.inertReason !== undefined) {
    item.inertReason = component.inertReason;
  }
  return item;
}

function maskedOptions(record: PluginInstallRecord, ir: PluginIr) {
  const sensitive = new Set(
    ir.components
      .filter(isConfigOptionComponent)
      .filter((component) => component.spec.sensitive === true)
      .map((component) => component.spec.key),
  );
  const options: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(record.options)) {
    options[key] = sensitive.has(key) ? MASKED_OPTION : value;
  }
  return options;
}

function countKind(ir: PluginIr, kind: PluginKind): number {
  return ir.components.filter((component) => component.kind === kind).length;
}
