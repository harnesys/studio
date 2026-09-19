/** Effective plugin set (spec §4 per-agent), переехало из `studio-run-targets.adapter.ts`
 *  в T5: общий модуль для хук-гранта таргетов и для per-agent фильтра каталог-порта.
 *  Closed world: `undefined`/пустая карта агента не называет ни одного плагина и даёт
 *  пустое множество; непустая карта пересекает workspace-набор буквально. */
import type { PluginAgentSource } from '../plugins/plugin-agents.ts';

export function effectivePluginNames(
  workspaceEnabled: readonly string[],
  enabledPlugins: Record<string, boolean> | undefined,
): Set<string> {
  if (enabledPlugins === undefined || Object.keys(enabledPlugins).length === 0) {
    return new Set();
  }
  return new Set(workspaceEnabled.filter((name) => enabledPlugins[name] === true));
}

export function effectivePlugins(
  loaded: readonly PluginAgentSource[],
  enabledPlugins: Record<string, boolean> | undefined,
): PluginAgentSource[] {
  const names = effectivePluginNames(
    loaded.map((entry) => entry.record.name),
    enabledPlugins,
  );
  return loaded.filter((entry) => names.has(entry.record.name));
}
