import type { AgentCatalogSummary, AgentDefinition, AgentModelRef, PluginIr } from 'harnesys';
import { bindAgentComponents } from 'harnesys';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import type { PluginInstallRecord } from '../../domain/plugin.port.ts';
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
 * per call; the IRs come from the registry cache.
 */
export function pluginAgentCatalog(
  entries: PluginAgentSource[],
  models?: LlmModelRepository,
  providers?: LlmProviderRepository,
): PluginAgentCatalog {
  const all = new Map<string, AgentDefinition>();
  for (const entry of entries) {
    const userConfig = pluginUserConfig(entry.ir, entry.record.options);
    const bound = bindAgentComponents(
      entry.ir,
      (ref) => resolveModelRef(ref, models, providers),
      undefined,
      userConfig,
    );
    for (const agent of bound) {
      all.set(agent.id, agent.definition);
    }
  }
  return {
    list(): AgentCatalogSummary[] {
      return [...all.entries()].map(([id, definition]) => ({
        id,
        name: pluginAgentName(id),
        role: 'plugin',
        instructions: definition.prompts.main?.instructions ?? '',
      }));
    },
    get(id: string): AgentDefinition | null {
      return all.get(id) ?? null;
    },
  };
}

/** Catalog display name: `plugin:agent` → `agent` (plugin namespace prefix). */
function pluginAgentName(id: string): string {
  return id.split(':').at(-1) ?? id;
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
