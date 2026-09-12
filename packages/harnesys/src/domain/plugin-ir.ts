import type { HookBinding } from './hook.ts';
import type { PluginName, PluginSourceFormat } from './plugin.ts';
import type { PluginDiagnostic } from './plugin-diagnostics.ts';

/** Метаданные плагина из манифеста/маркетплейса; имя — ключ всех записей. */
export type PluginIdentity = {
  name: PluginName;
  displayName?: string;
  version?: string;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  defaultEnabled?: boolean;
};

/** Пятнадцать видов компонентов; пять инертных парсятся, но не исполняются. */
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

/** Инертные kinds: валидируются и видны в матрице, не исполняются. */
export type InertKind = 'theme' | 'workflow' | 'channel' | 'output-style' | 'eval';

/** Жизненный цикл компонента: native/inert — parse-статусы, blocked_by_grant вычисляется на load, dropped — с diagnostic. */
export type ComponentStatus = 'native' | 'inert' | 'blocked_by_grant' | 'dropped';

/** Плагин-относительный путь и якорь внутри файла. */
export type ComponentSource = { file: string; pointer: string };

/** Компонент IR: типизированный spec по kind, источник и статус. */
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

/** Скилл из skills/<name>/SKILL.md. */
export type SkillSpec = { id: string; name: string; dir: string };

/** Плоская команда commands/<name>.md → скилл plugin:slug. */
export type CommandSpec = { id: string; name: string; file: string };

/** Агент из agents/*.md; model остаётся строкой, резолвер — у хоста. */
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
};

/** Хук: event/matcher уже в binding (HookMatcher). */
export type HookSpec = { binding: HookBinding };

/** MCP-сервер: stdio-команда или внешний url (streamable-http/sse). */
export type McpServerSpec = {
  serverId: string;
  config:
    | {
        type: 'stdio';
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
      }
    | { type: 'streamable-http' | 'sse'; url: string; headers?: Record<string, string> };
};

/** Языковой сервер: полная форма Claude lspServers-записи. */
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

/** Монитор: long-running процесс, stdout-строки → Notification. */
export type MonitorSpec = { name: string; command: string; description: string; when?: string };

/** Каталог bin/ с исполняемыми файлами → PATH рана. */
export type PathEntrySpec = { dir: string };

/** Дефолт настройки пака: применяется до specSchema-валидации. */
export type SettingDefaultSpec = { key: string; value: unknown };

/** userConfig-опция плагина: схема поля для UI и подстановки ${user_config.KEY}. */
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

/** Инертный компонент: сырой вид сохраняется для карточки. */
export type InertSpec = { raw: unknown };

/** Что плагин декларирует по грант-классам; выводится из components. */
export type PluginGrants = { needsProcess: boolean; needsNetwork: boolean };

/** Единое внутреннее представление плагина: identity, формат, компоненты, гранты, диагностика. */
export type PluginIr = {
  identity: PluginIdentity;
  sourceFormat: PluginSourceFormat;
  declaredSchema?: string;
  components: PluginComponent[];
  grants: PluginGrants;
  diagnostics: PluginDiagnostic[];
};
