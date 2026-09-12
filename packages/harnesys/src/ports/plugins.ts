import type { UserConfigContentOptions } from '../application/plugins/user-config.ts';
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

export type RunPluginHookCommandOptions = {
  pluginRoot: string;
  pluginData: string;
  command: string;
  timeoutMs: number;
  envExtra?: Record<string, string>;
  userConfig?: UserConfigContentOptions;
};

export type RunPluginHookCommandOk = {
  ok: true;
  stdout: string;
};

export type RunPluginHookCommandFail = {
  ok: false;
  error: string;
};

export type RunPluginHookCommandResult = RunPluginHookCommandOk | RunPluginHookCommandFail;
