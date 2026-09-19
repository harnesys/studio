import type { PluginName } from '@harnesys/studio-shared';

/**
 * Host-side store for sensitive userConfig values, keyed by node id, plugin
 * name and option key. Values here never reach SQLite; when the port is
 * unavailable sensitive saves are refused with a diagnostic.
 */
export type SecretStore = {
  get(nodeId: string, pluginId: PluginName, key: string): Promise<string | null>;
  set(nodeId: string, pluginId: PluginName, key: string, value: string): Promise<void>;
  delete(nodeId: string, pluginId: PluginName, key: string): Promise<void>;
};
