import type { Plugin, PluginLoadDiagnostic } from '../domain/plugin.ts';
import type { CursorMcpJson } from './mcp.ts';

export type LoadPluginFromDirectoryOptions = {
  root: string;
  pluginData: string;
};

export type LoadPluginResult = {
  plugin: Plugin;
  mcp: CursorMcpJson;
  diagnostics: PluginLoadDiagnostic[];
};

export type PluginLoader = {
  loadPluginFromDirectory(options: LoadPluginFromDirectoryOptions): Promise<LoadPluginResult>;
};

export type RunPluginHookCommandOptions = {
  pluginRoot: string;
  pluginData: string;
  command: string;
  timeoutMs: number;
  envExtra?: Record<string, string>;
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
