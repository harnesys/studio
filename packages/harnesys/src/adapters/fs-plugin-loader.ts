import { loadPluginIrFromDirectory as loadPluginIrFromDirectoryImpl } from '../application/plugins/load-plugin.ts';
import type {
  LoadPluginIrFromDirectoryOptions,
  LoadPluginIrResult,
  PluginLoader,
} from '../ports/plugins.ts';
export class FsPluginLoader implements PluginLoader {
  loadPluginIrFromDirectory(
    options: LoadPluginIrFromDirectoryOptions,
  ): Promise<LoadPluginIrResult> {
    return loadPluginIrFromDirectoryImpl(options);
  }
}
export function loadPluginIrFromDirectory(
  options: LoadPluginIrFromDirectoryOptions,
): Promise<LoadPluginIrResult> {
  return loadPluginIrFromDirectoryImpl(options);
}
