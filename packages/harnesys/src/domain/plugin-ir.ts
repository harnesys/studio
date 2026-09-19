import type { HookBinding } from './hook.ts';
import type { PluginName, PluginSourceFormat } from './plugin.ts';
import type { PluginDiagnostic } from './plugin-diagnostics.ts';
export type PluginAuthor = {
  name?: string;
  email?: string;
  url?: string;
};
export type PluginIdentity = {
  name: PluginName;
  displayName?: string;
  version?: string;
  description?: string;
  author?: PluginAuthor;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  defaultEnabled?: boolean;
};
export type PluginKind =
  | 'skill'
  | 'command'
  | 'agent'
  | 'hook'
  | 'mcp-server'
  | 'lsp-server'
  | 'monitor'
  | 'path-entry'
  | 'setting-default'
  | 'config-option'
  | 'theme'
  | 'workflow'
  | 'channel'
  | 'output-style'
  | 'eval';
export type InertKind = 'theme' | 'workflow' | 'channel' | 'output-style' | 'eval';
export type ComponentStatus = 'native' | 'inert' | 'blocked_by_grant' | 'dropped';
export type ComponentSource = {
  file: string;
  pointer: string;
};
export type PluginComponent = {
  kind: PluginKind;
  spec:
    | SkillSpec
    | CommandSpec
    | AgentSpec
    | HookSpec
    | McpServerSpec
    | LspServerSpec
    | MonitorSpec
    | PathEntrySpec
    | SettingDefaultSpec
    | ConfigOptionSpec
    | InertSpec;
  source: ComponentSource;
  status: ComponentStatus;
  inertReason?: string;
};
export type SkillSpec = {
  id: string;
  name: string;
  dir: string;
};
export type CommandSpec = {
  id: string;
  name: string;
  file: string;
};
export type AgentSpec = {
  id: string;
  name: string;
  description?: string;
  file: string;
  model?: string;
  effort?: string;
  maxTurns?: number;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  memory?: string;
  background?: boolean;
  color?: string;
};
export type HookSpec = {
  binding: HookBinding;
};
export type McpServerConfig =
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    }
  | {
      type: 'streamable-http' | 'sse';
      url: string;
      headers?: Record<string, string>;
    };
export type McpServerSpec = {
  serverId: string;
  config: McpServerConfig;
};
export type LspServerSpec = {
  serverId: string;
  command: string;
  args?: string[];
  transport?: 'stdio' | 'socket';
  env?: Record<string, string>;
  initializationOptions?: unknown;
  settings?: unknown;
  workspaceFolder?: string;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  restartOnCrash?: boolean;
  maxRestarts?: number;
  diagnostics?: boolean;
  extensionToLanguage: Record<string, string>;
};
export type MonitorSpec = {
  name: string;
  command: string;
  description: string;
  when?: string;
};
export type PathEntrySpec = {
  dir: string;
};
export type SettingDefaultSpec = {
  key: string;
  value: unknown;
};
export type ConfigOptionSpec = {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string;
  description: string;
  sensitive?: boolean;
  required?: boolean;
  default?: string | number | boolean;
  multiple?: boolean;
  min?: number;
  max?: number;
};
export type InertSpec = {
  raw: unknown;
};
export type PluginGrants = {
  needsProcess: boolean;
  needsNetwork: boolean;
};
export type PluginIr = {
  identity: PluginIdentity;
  sourceFormat: PluginSourceFormat;
  declaredSchema?: string;
  components: PluginComponent[];
  grants: PluginGrants;
  diagnostics: PluginDiagnostic[];
};
