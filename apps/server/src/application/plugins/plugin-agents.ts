import type {
  AgentCatalogSummary,
  AgentDefinition,
  AgentModelRef,
  AgentRosterEntry,
  BindDiagnosticSink,
  McpServerSpec,
  PackRegistration,
  PluginComponent,
  PluginIr,
  PluginMcpBinding,
} from 'harnesys';
import { bindAgentComponents } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { buildReactGraph } from '../agents/react-preset.ts';
import { pluginUserConfig } from './plugin-user-config.ts';
export type PluginAgentCatalog = {
  list(): AgentCatalogSummary[];
  get(id: string): AgentDefinition | null;
};
export type PluginAgentSource = {
  record: PluginInstallRecord;
  ir: PluginIr;
};
export function pluginAgentCatalog(
  entries: PluginAgentSource[],
  models?: LlmModelRepository,
  providers?: LlmProviderRepository,
  onDiagnostic?: BindDiagnosticSink,
  registrations?: PackRegistration[],
  workspaceId?: string,
): PluginAgentCatalog {
  const packIndex = new Map(
    (registrations ?? []).flatMap((r) =>
      r.pack.meta.tools.map((t) => [t.name, r.pack.name] as const),
    ),
  );
  const all = new Map<
    string,
    {
      definition: AgentDefinition;
      color?: string;
    }
  >();
  for (const entry of entries) {
    const userConfig = pluginUserConfig(entry.ir, entry.record.options);
    const bound = bindAgentComponents(entry.ir, {
      resolveModel: (ref) => resolveModelRef(ref, models, providers, workspaceId),
      onDiagnostic,
      userConfig,
      packIndex,
    });
    for (const agent of bound) {
      all.set(agent.id, {
        definition: {
          ...agent.definition,
          graph: buildReactGraph(),
        },
        ...(agent.color !== undefined ? { color: agent.color } : {}),
      });
    }
  }
  return {
    list(): AgentCatalogSummary[] {
      return [...all.entries()].map(([id, entry]) => {
        const agentName = pluginAgentName(id);
        return {
          id,
          name: agentName,
          role: agentName,
          plugin: true,
          instructions: entry.definition.prompts.main?.instructions ?? '',
          ...(entry.color !== undefined ? { color: entry.color } : {}),
        };
      });
    },
    get(id: string): AgentDefinition | null {
      return all.get(id)?.definition ?? null;
    },
  };
}
export function workspaceIdsWithPlugins(repo: PluginRepository): string[] {
  const ids = new Set<string>();
  for (const record of repo.listAll()) {
    ids.add(record.workspaceId);
  }
  return [...ids];
}
type McpServerComponent = PluginComponent & {
  spec: McpServerSpec;
};
function isMcpServerComponent(component: PluginComponent): component is McpServerComponent {
  return component.kind === 'mcp-server' && component.status === 'native';
}
export function toMcpBinding(
  entry: PluginAgentSource,
  disabled: ReadonlySet<string>,
): PluginMcpBinding {
  return {
    name: entry.record.name,
    pluginRoot: entry.record.path,
    pluginData: entry.record.dataPath,
    servers: entry.ir.components
      .filter(isMcpServerComponent)
      .map((component) => component.spec)
      .filter((spec) => !disabled.has(`${entry.record.name}:${spec.serverId}`)),
    userConfig: pluginUserConfig(entry.ir, entry.record.options),
  };
}
function pluginAgentName(id: string): string {
  return id.split(':').at(-1) ?? id;
}
export function enabledRecords(repo: PluginRepository, workspaceId: string): PluginInstallRecord[] {
  return repo.list(workspaceId);
}
export function scopedAgentRoster(
  agents: AgentRepository | undefined,
  parent: AgentDefinition | undefined,
  warmPluginRows: (workspaceId: string) => AgentCatalogSummary[],
): AgentRosterEntry[] {
  const row = parent === undefined ? undefined : agents?.findById(parent.id);
  if (agents === undefined || parent === undefined || row === undefined) {
    return [];
  }
  const host: AgentRosterEntry[] = agents.listByWorkspace(row.workspaceId).map((a) => ({
    id: a.id,
    name: a.name,
    parentId: a.parentId,
  }));
  const plugin: AgentRosterEntry[] = [];
  for (const entry of warmPluginRows(row.workspaceId)) {
    const owner = entry.id.split(':')[0] ?? entry.id;
    if (parent.enabledPlugins?.[owner] === true) {
      plugin.push({ id: entry.id, name: entry.name, plugin: owner });
    }
  }
  return [...host, ...plugin];
}
function resolveModelRef(
  ref: string,
  models?: LlmModelRepository,
  providers?: LlmProviderRepository,
  workspaceId?: string,
): AgentModelRef | null {
  if (models === undefined || providers === undefined || workspaceId === undefined) {
    return null;
  }
  const separator = ref.indexOf('/');
  const modelName = separator === -1 ? ref : ref.slice(separator + 1);
  const provider =
    separator === -1
      ? providers.list(workspaceId).find((row) => hasModel(models, row.id, modelName))
      : providers.findByName(workspaceId, ref.slice(0, separator));
  if (provider === undefined) {
    if (separator === -1) {
      const hit = providers
        .list(workspaceId)
        .flatMap((p) => models.listByProvider(p.id).map((m) => ({ provider: p, model: m })))
        .find(({ model }) => model.name.toLowerCase().includes(modelName.toLowerCase()));
      if (hit) {
        return { provider: hit.provider.name, model: hit.model.name };
      }
    }
    return null;
  }
  const model = models.findByProviderAndName(provider.id, modelName);
  return model === undefined ? null : { provider: provider.name, model: model.name };
}
function hasModel(models: LlmModelRepository, providerId: string, modelName: string): boolean {
  return models.findByProviderAndName(providerId, modelName) !== undefined;
}
