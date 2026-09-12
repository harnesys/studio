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

/**
 * Grant-class map for IR components (spec §4): content = skills, commands,
 * agents, setting-default, config-option, hooks(prompt); process = hooks
 * (command), mcp(stdio), lsp, monitors, bin, hooks(mcp_tool, inherited from
 * the addressed server); network = hooks(http), mcp(url transports).
 * `undefined` = no class (inline/agent hooks, inert slots) — never filtered.
 */
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

/** hooks(mcp_tool) inherits the class of the addressed plugin server; unknown → no class. */
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

/**
 * Derived workspace view of a plugin IR: components whose grant class is not
 * granted become `blocked_by_grant`; a granted stdio server without a
 * per-server approval becomes `blocked_by_grant` with reason
 * `needs_server_approval`. The input IR (cached parse result) is never
 * mutated: gating is recomputed on every load (spec §4 cache invariant).
 */
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

/**
 * Hook bindings of one plugin: native hook components of the (gated) IR.
 * Command handlers get `${user_config.*}` exec substitution and the
 * `HARNESSYS_PLUGIN_OPTION_<KEY>` env (spec §2.2); an unresolved reference
 * drops the binding with a warning — the engine executor refuses it anyway.
 */
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

/** All option values exported as env, sensitive included (spec §2.2). */
export function optionEnv(userConfig: UserConfigContentOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(userConfig.values)) {
    env[`${OPTION_ENV_PREFIX}${key.toUpperCase()}`] = String(value);
  }
  return env;
}

/**
 * Agent-declared hooks → run-bus bindings: `id` is stable per agent and
 * index, vars point at the workspace cwd (agent bindings carry no plugin
 * roots), origin 'agent' (spec §2.4 assembly order).
 */
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
