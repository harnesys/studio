import type { PluginDiagnostic } from '../domain/plugin-diagnostics.ts';
import type { PluginIr } from '../domain/plugin-ir.ts';

export type LoadPluginIrFromDirectoryOptions = {
  root: string;
  pluginData: string;
};

export type LoadPluginIrResult = {
  ir: PluginIr;
  diagnostics: PluginDiagnostic[];
};

export type PluginLoader = {
  loadPluginIrFromDirectory(options: LoadPluginIrFromDirectoryOptions): Promise<LoadPluginIrResult>;
};
