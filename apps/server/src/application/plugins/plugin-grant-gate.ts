import type { GrantClass } from '@harnesys/studio-shared';
import type {
  HookBinding,
  HooksBinding,
  Logger,
  McpServerSpec,
  PluginComponent,
  PluginIr,
} from 'harnesys';
import { substituteUserConfig, type UserConfigContentOptions } from 'harnesys';
import type { PluginGrants } from '../../domain/plugin.port.ts';
export function componentGrantClass(
  component: PluginComponent,
  ir: PluginIr,
): GrantClass | undefined {
  switch (component.kind) {
    case 'skill':
    case 'command':
    case 'agent':
    case 'setting-default':
    case 'config-option':
      return 'content';
    case 'lsp-server':
    case 'monitor':
    case 'path-entry':
      return 'process';
    case 'mcp-server':
      return mcpServerClass(component);
    case 'hook':
      return hookGrantClass(component, ir);
    default:
      return undefined;
  }
}
function mcpServerClass(component: PluginComponent): GrantClass {
  const spec = component.spec as McpServerSpec;
  return spec.config.type === 'stdio' ? 'process' : 'network';
}
function hookGrantClass(component: PluginComponent, ir: PluginIr): GrantClass | undefined {
  if (!('binding' in component.spec)) {
    return undefined;
  }
  const handler = component.spec.binding.handler;
  switch (handler.type) {
    case 'prompt':
      return 'content';
    case 'command':
      return 'process';
    case 'http':
      return 'network';
    case 'mcp_tool':
      return addressedServerClass(handler.server, ir);
    default:
      return undefined;
  }
}
function addressedServerClass(server: string, ir: PluginIr): GrantClass | undefined {
  const serverId = server.split(':').at(-1) ?? '';
  for (const component of ir.components) {
    if (component.kind !== 'mcp-server' || component.status !== 'native') {
      continue;
    }
    const spec = component.spec as McpServerSpec;
    if (spec.serverId === serverId) {
      return mcpServerClass(component);
    }
  }
  return undefined;
}
export function applyGrantGating(
  ir: PluginIr,
  grants: PluginGrants,
  approvedServers: ReadonlySet<string>,
): PluginIr {
  return {
    ...ir,
    components: ir.components.map((component) => {
      if (component.status !== 'native') {
        return component;
      }
      const grantClass = componentGrantClass(component, ir);
      if (grantClass !== undefined && grants[grantClass] !== true) {
        return { ...component, status: 'blocked_by_grant' as const };
      }
      if (isUnapprovedStdioServer(component, approvedServers)) {
        return {
          ...component,
          status: 'blocked_by_grant' as const,
          inertReason: 'needs_server_approval',
        };
      }
      return component;
    }),
  };
}
function isUnapprovedStdioServer(
  component: PluginComponent,
  approvedServers: ReadonlySet<string>,
): boolean {
  if (component.kind !== 'mcp-server') {
    return false;
  }
  const spec = component.spec as McpServerSpec;
  return spec.config.type === 'stdio' && !approvedServers.has(spec.serverId);
}
const OPTION_ENV_PREFIX = 'HARNESSYS_PLUGIN_OPTION_';
export function pluginHookBindings(
  ir: PluginIr,
  userConfig: UserConfigContentOptions,
  logger?: Logger,
): HookBinding[] {
  const bindings: HookBinding[] = [];
  for (const component of ir.components) {
    if (component.kind !== 'hook' || component.status !== 'native') {
      continue;
    }
    if (!('binding' in component.spec)) {
      continue;
    }
    const resolved = resolveCommandEnv(component.spec.binding, userConfig);
    if (resolved === undefined) {
      logger?.warn(
        `[plugins] hook binding ${component.spec.binding.id} dropped: user_config unresolved`,
      );
      continue;
    }
    bindings.push(resolved);
  }
  return bindings;
}
function resolveCommandEnv(
  binding: HookBinding,
  userConfig: UserConfigContentOptions,
): HookBinding | undefined {
  const handler = binding.handler;
  if (handler.type !== 'command') {
    return binding;
  }
  const substitute = (value: string): string | undefined => {
    const result = substituteUserConfig(value, userConfig.values, userConfig.sensitiveKeys);
    return typeof result === 'string' ? result : undefined;
  };
  const command = substitute(handler.command);
  if (command === undefined) {
    return undefined;
  }
  let args: string[] | undefined;
  if (handler.args !== undefined) {
    args = [];
    for (const arg of handler.args) {
      const substituted = substitute(arg);
      if (substituted === undefined) {
        return undefined;
      }
      args.push(substituted);
    }
  }
  let env: Record<string, string> | undefined;
  if (handler.env !== undefined) {
    env = {};
    for (const [key, value] of Object.entries(handler.env)) {
      const substituted = substitute(value);
      if (substituted === undefined) {
        return undefined;
      }
      env[key] = substituted;
    }
  }
  env = { ...optionEnv(userConfig), ...(env ?? {}) };
  return {
    ...binding,
    handler: { ...handler, command, ...(args !== undefined ? { args } : {}), env },
  };
}
export function optionEnv(userConfig: UserConfigContentOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(userConfig.values)) {
    env[`${OPTION_ENV_PREFIX}${key.toUpperCase()}`] = String(value);
  }
  return env;
}
export function agentHookBindings(
  agentId: string,
  hooks: HooksBinding[],
  cwd: string,
): HookBinding[] {
  return hooks.map((hook, index) => ({
    id: `${agentId}:${hook.event}:${index}`,
    origin: 'agent' as const,
    event: hook.event,
    ...(hook.matcher !== undefined ? { matcher: hook.matcher } : {}),
    handler: hook.handler,
    vars: { pluginRoot: cwd, pluginData: cwd },
  }));
}
