import { loadPluginFromDirectory as loadPluginFromDirectoryImpl } from '../application/plugins/load-plugin.ts';
import type {
  LoadPluginFromDirectoryOptions,
  LoadPluginResult,
  PluginLoader,
} from '../ports/plugins.ts';

export class FsPluginLoader implements PluginLoader {
  loadPluginFromDirectory(options: LoadPluginFromDirectoryOptions): Promise<LoadPluginResult> {
    return loadPluginFromDirectoryImpl(options);
  }
}

export function loadPluginFromDirectory(
  options: LoadPluginFromDirectoryOptions,
): Promise<LoadPluginResult> {
  return loadPluginFromDirectoryImpl(options);
}
