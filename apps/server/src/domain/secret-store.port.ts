import type { PluginName } from '@harnesys/studio-shared';
export type SecretStore = {
  get(nodeId: string, pluginId: PluginName, key: string): Promise<string | null>;
  set(nodeId: string, pluginId: PluginName, key: string, value: string): Promise<void>;
  delete(nodeId: string, pluginId: PluginName, key: string): Promise<void>;
};
