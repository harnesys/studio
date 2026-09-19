import type { ConfigOptionSpec, LspServerSpec, PluginComponent, PluginIr } from 'harnesys';
import {
  type ConfigError,
  substituteUserConfig,
  type UserConfigContentOptions,
  type UserConfigValue,
} from 'harnesys';
import type { PluginOptionValue } from '../../domain/plugin.port.ts';

type ConfigOptionComponent = PluginComponent & {
  spec: ConfigOptionSpec;
};
export function isConfigOptionComponent(
  component: PluginComponent,
): component is ConfigOptionComponent {
  return component.kind === 'config-option' && 'title' in component.spec;
}
export function pluginUserConfig(
  ir: PluginIr,
  stored: Record<string, PluginOptionValue>,
): UserConfigContentOptions {
  const values: Record<string, UserConfigValue> = {};
  const sensitiveKeys = new Set<string>();
  for (const component of ir.components) {
    if (!isConfigOptionComponent(component)) {
      continue;
    }
    const spec = component.spec;
    if (spec.sensitive === true) {
      sensitiveKeys.add(spec.key);
    }
    const value = stored[spec.key] ?? spec.default;
    if (value !== undefined) {
      values[spec.key] = value;
    }
  }
  return { values, sensitiveKeys };
}
export function substituteLspSpec(
  spec: LspServerSpec,
  userConfig: UserConfigContentOptions,
): LspServerSpec | ConfigError {
  const substitute = (value: string): string | ConfigError =>
    substituteUserConfig(value, userConfig.values, userConfig.sensitiveKeys);
  const command = substitute(spec.command);
  if (typeof command !== 'string') {
    return command;
  }
  let args: string[] | undefined;
  if (spec.args !== undefined) {
    args = [];
    for (const arg of spec.args) {
      const substituted = substitute(arg);
      if (typeof substituted !== 'string') {
        return substituted;
      }
      args.push(substituted);
    }
  }
  let env: Record<string, string> | undefined;
  if (spec.env !== undefined) {
    env = {};
    for (const [key, value] of Object.entries(spec.env)) {
      const substituted = substitute(value);
      if (typeof substituted !== 'string') {
        return substituted;
      }
      env[key] = substituted;
    }
  }
  let workspaceFolder: string | undefined;
  if (spec.workspaceFolder !== undefined) {
    const substituted = substitute(spec.workspaceFolder);
    if (typeof substituted !== 'string') {
      return substituted;
    }
    workspaceFolder = substituted;
  }
  return {
    ...spec,
    command,
    ...(args !== undefined ? { args } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(workspaceFolder !== undefined ? { workspaceFolder } : {}),
  };
}
