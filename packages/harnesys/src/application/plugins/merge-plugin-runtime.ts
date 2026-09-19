import { resolve } from 'node:path';
import type { PluginName } from '../../domain/plugin.ts';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import type { McpServerConfig, McpServerSpec } from '../../domain/plugin-ir.ts';
import type { CursorMcpJson, McpServerEntries, StdioEntry, UrlEntry } from '../../ports/mcp.ts';
import { assertInsideRoot } from './plugin-conformance.ts';
import type { UserConfigContentOptions } from './user-config.ts';
import { substituteUserConfig } from './user-config.ts';
export type PluginMcpBinding = {
  name: PluginName;
  pluginRoot: string;
  pluginData: string;
  servers: McpServerSpec[];
  userConfig?: UserConfigContentOptions;
};
export type MergedPluginMcp = {
  mcp: CursorMcpJson;
  diagnostics: PluginDiagnostic[];
};
const SERVER_KEY_PREFIX = 'plugin:';
function scopedToolPrefix(pluginName: string, serverId: string): string {
  const sanitize = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, '_');
  return `mcp__plugin_${sanitize(pluginName)}_${sanitize(serverId)}__`;
}
export function mergePluginMcpFragments(
  base: CursorMcpJson,
  plugins: PluginMcpBinding[],
): MergedPluginMcp {
  const mcpServers: McpServerEntries = { ...base.mcpServers };
  const diagnostics: PluginDiagnostic[] = [];
  for (const plugin of plugins) {
    for (const spec of plugin.servers) {
      const entry = bindServerEntry(spec, plugin, diagnostics);
      if (entry !== undefined) {
        entry.toolPrefix = scopedToolPrefix(plugin.name, spec.serverId);
        mcpServers[`${SERVER_KEY_PREFIX}${plugin.name}:${spec.serverId}`] = entry;
      }
    }
  }
  return { mcp: { mcpServers }, diagnostics };
}
function bindServerEntry(
  spec: McpServerSpec,
  plugin: PluginMcpBinding,
  diagnostics: PluginDiagnostic[],
): StdioEntry | UrlEntry | undefined {
  try {
    return spec.config.type === 'stdio'
      ? bindStdioEntry(spec.config, plugin)
      : bindUrlEntry(spec.config, plugin);
  } catch (cause) {
    diagnostics.push({
      level: 'warning',
      code: cause instanceof McpContainmentError ? 'path_escapes_root' : 'server_config_invalid',
      message: `mcp server "${spec.serverId}": ${cause instanceof Error ? cause.message : String(cause)}`,
      path: `${SERVER_KEY_PREFIX}${plugin.name}:${spec.serverId}`,
    });
    return undefined;
  }
}
function bindStdioEntry(
  config: Extract<
    McpServerConfig,
    {
      type: 'stdio';
    }
  >,
  plugin: PluginMcpBinding,
): StdioEntry {
  const entry: StdioEntry = { command: substitute(config.command, plugin) };
  if (config.cwd !== undefined) {
    const cwd = substitute(config.cwd, plugin);
    assertCwdInsidePlugin(cwd, plugin);
    entry.cwd = cwd;
  }
  if (config.args !== undefined) {
    entry.args = config.args.map((arg) => substitute(arg, plugin));
  }
  if (config.env !== undefined) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.env)) {
      env[key] = substitute(value, plugin);
    }
    entry.env = env;
  }
  return entry;
}
function bindUrlEntry(
  config: Extract<
    McpServerConfig,
    {
      type: 'streamable-http' | 'sse';
    }
  >,
  plugin: PluginMcpBinding,
): UrlEntry {
  const entry: UrlEntry = {
    url: substitute(config.url, plugin),
    type: config.type === 'sse' ? 'sse' : 'http',
  };
  if (config.headers !== undefined) {
    entry.headers = { ...config.headers };
  }
  return entry;
}
class McpContainmentError extends Error {}
function assertCwdInsidePlugin(cwd: string, plugin: PluginMcpBinding): void {
  const resolved = resolve(cwd);
  if (
    assertInsideRoot(plugin.pluginRoot, resolved) ||
    assertInsideRoot(plugin.pluginData, resolved)
  ) {
    return;
  }
  throw new McpContainmentError(`cwd escapes plugin root: ${cwd}`);
}
function substitute(value: string, plugin: PluginMcpBinding): string {
  if (plugin.userConfig === undefined || !value.includes('${user_config.')) {
    return value;
  }
  const result = substituteUserConfig(
    value,
    plugin.userConfig.values,
    plugin.userConfig.sensitiveKeys,
  );
  if (typeof result === 'string') {
    return result;
  }
  throw new Error(result.message);
}
