import type { PluginDiagnostic } from '../domain/plugin-diagnostics.ts';
import type { PluginIr } from '../domain/plugin-ir.ts';
import type { CursorMcpJson } from './mcp.ts';

export type LoadPluginIrFromDirectoryOptions = {
  root: string;
  pluginData: string;
};

export type LoadPluginIrResult = {
  ir: PluginIr;
  mcpFragment: CursorMcpJson;
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
