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
