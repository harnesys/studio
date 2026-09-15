import type {
  AgentCatalogSummary,
  AgentDefinition,
  AgentModelRef,
  AgentRosterEntry,
  BindDiagnosticSink,
  PackRegistration,
  PluginIr,
} from 'harnesys';
import { bindAgentComponents } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import type { PluginInstallRecord, PluginRepository } from '../../domain/plugin.port.ts';
import { buildReactGraph } from '../agents/react-preset.ts';
import { pluginUserConfig } from './plugin-user-config.ts';

/** Catalog of agents bound from the workspace's enabled plugins (spec §3 agent). */
export type PluginAgentCatalog = {
  list(): AgentCatalogSummary[];
  get(id: string): AgentDefinition | null;
};

/** Same shape the registry's `loadEnabledPlugins` returns. */
export type PluginAgentSource = {
  record: PluginInstallRecord;
  ir: PluginIr;
};

/**
 * `bindAgentComponents` over the workspace's (grant-gated) plugin IRs.
 * `model: "provider/model"` resolves against Studio model/provider rows; a
 * bare `model` matches when exactly one provider has it, then falls back to a
 * case-insensitive substring match across all providers (alias style:
 * `sonnet`/`opus`/`haiku`). An unresolved model keeps the component without
 * `model`: the engine inherits the parent run model on spawn. Entries rebuild
 * per call; the IRs come from the registry cache. Studio swaps the library's
 * one-shot `start → llm:generate → end` for the host ReAct preset so plugin
 * agents keep working after a tool call.
 */
// biome-ignore lint/complexity/useMaxParams: registrations is the optional 5th param for pack-index wiring; existing callers unaffected
export function pluginAgentCatalog(
  entries: PluginAgentSource[],
  models?: LlmModelRepository,
  providers?: LlmProviderRepository,
  onDiagnostic?: BindDiagnosticSink,
  registrations?: PackRegistration[],
): PluginAgentCatalog {
  const packIndex = new Map(
    (registrations ?? []).flatMap((r) =>
      r.pack.meta.tools.map((t) => [t.name, r.pack.name] as const),
    ),
  );
  const all = new Map<string, { definition: AgentDefinition; color?: string }>();
  for (const entry of entries) {
    const userConfig = pluginUserConfig(entry.ir, entry.record.options);
    const bound = bindAgentComponents(
      entry.ir,
      (ref) => resolveModelRef(ref, models, providers),
      onDiagnostic,
      userConfig,
      packIndex,
    );
    for (const agent of bound) {
      all.set(agent.id, {
        definition: {
          ...agent.definition,
          // Движок добирает бюджет по цепочке spawn-call > def > родитель;
          // константа здесь перекрыла бы наследование.
          graph: buildReactGraph(agent.definition.tools ?? []),
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
          // Роль каталожной строки — имя из документа; `plugin: true` до смены level-модели.
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

/** Catalog display name: `pluginName:agentName` → `agentName` (plugin namespace prefix). */
function pluginAgentName(id: string): string {
  return id.split(':').at(-1) ?? id;
}

/** Installed plugin records enabled for a workspace. */
export function enabledRecords(repo: PluginRepository, workspaceId: string): PluginInstallRecord[] {
  return repo.list().filter((record) => record.enabledWorkspaceIds.includes(workspaceId));
}

/**
 * Roster visible to a running agent: host agents of the parent's workspace
 * + plugin agents whose plugin is enabled on the parent
 * (`enabledPlugins[owner] === true`). No parent or no DB row for it → empty:
 * better empty than cross-workspace. The plugin owner is the `pluginName:`
 * prefix of the catalog id.
 */
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

/** `provider/model` → AgentModelRef over Studio rows; null = model stays unset. */
function resolveModelRef(
  ref: string,
  models?: LlmModelRepository,
  providers?: LlmProviderRepository,
): AgentModelRef | null {
  if (models === undefined || providers === undefined) {
    return null;
  }
  const separator = ref.indexOf('/');
  const modelName = separator === -1 ? ref : ref.slice(separator + 1);
  const provider =
    separator === -1
      ? providers.list().find((row) => hasModel(models, row.id, modelName))
      : providers.findByName(ref.slice(0, separator));
  if (provider === undefined) {
    // exact miss on a bare alias (sonnet/opus/haiku): substring match across providers
    if (separator === -1) {
      const hit = providers
        .list()
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
