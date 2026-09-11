export type PluginName = string;

export type PluginSchemaVersion = '1.0.0';

export type PluginSourceFormat = 'agent-plugins' | 'claude-compat';

export type PluginAuthor = {
  name?: string;
  email?: string;
  url?: string;
};

export type PluginExtensions = Record<string, Record<string, unknown>>;

export type PluginManifest = {
  schemaVersion: PluginSchemaVersion;
  name: PluginName;
  version?: string;
  description?: string;
  author?: PluginAuthor;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions: PluginExtensions;
};

export type PluginSkillRef = {
  id: string;
  name: string;
  dir: string;
};

export type PluginMcpServer = {
  serverId: string;
};

export type PluginHookEvent =
  | 'SessionStart'
  | 'SessionStart:startup'
  | 'SessionStart:clear'
  | 'SessionStart:compact';

export type PluginHookCommand = {
  event: PluginHookEvent;
  command: string;
  async: boolean;
};

export type PluginAgentRef = {
  id: string;
  path: string;
  name: string;
  description?: string;
};

export type PluginCommandRef = {
  id: string;
  path: string;
  name: string;
  description?: string;
};

export type PluginLoadDiagnostic = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
};

export type Plugin = {
  root: string;
  sourceFormat: PluginSourceFormat;
  manifest: PluginManifest;
  skills: PluginSkillRef[];
  mcpServers: PluginMcpServer[];
  hooks: PluginHookCommand[];
  agents: PluginAgentRef[];
  commands: PluginCommandRef[];
};
