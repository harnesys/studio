import path from 'node:path';
import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { McpServerConfig, McpServerSpec, PluginComponent } from '../../../domain/plugin-ir.ts';
import {
  type ExpandPluginVarsContext,
  expandPluginVars,
  PLUGIN_DATA_PLACEHOLDER,
  PLUGIN_ROOT_PLACEHOLDER,
} from '../expand-plugin-vars.ts';
import { assertInsideRoot } from '../plugin-conformance.ts';
import { validateApMcp } from '../schema-loader.ts';
import {
  type DiscoverContext,
  entryWarning,
  isFile,
  overrideDirs,
  overrideInlineObject,
  readFile,
  relativeToRoot,
} from './discover.ts';
import { isPlainObject, type PathOverrideValue } from './manifest-result.ts';

const RESERVED_ENV_KEYS = new Set(['PLUGIN_ROOT', 'PLUGIN_DATA']);

const AP_MCP_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

const CWD_FORM = new RegExp(
  `^(?:\\./|${escapeRegExp(PLUGIN_ROOT_PLACEHOLDER)}(?:/|$)|${escapeRegExp(PLUGIN_DATA_PLACEHOLDER)}(?:/|$))`,
);

const CWD_FORM_MESSAGE = `cwd must be "./…", "${PLUGIN_ROOT_PLACEHOLDER}" / "${PLUGIN_ROOT_PLACEHOLDER}/…", or "${PLUGIN_DATA_PLACEHOLDER}" / "${PLUGIN_DATA_PLACEHOLDER}/…"`;

export type DiscoverMcpOptions = {
  pluginData: string;
  declaredSchema?: string;
  override?: PathOverrideValue;
};

export type DiscoverMcpResult = {
  components: PluginComponent[];
  diagnostics: PluginDiagnostic[];
};

/**
 * Обе MCP-конвенции: `mcp.json` AP со строгой `validateApMcp` + variants §7.2.1
 * (single-token command, cwd-формы, env PLUGIN_ROOT/PLUGIN_DATA запрещены) и
 * `.mcp.json` Claude с `CLAUDE_*`-плейсхолдерами, в обеих формах карты серверов
 * (обёртка `mcpServers` / голая `name → config`); `transport: 'socket'` в Claude
 * принимается и исполняется поверх stdio, AP-union остаётся закрытым без socket.
 * `$schema` mismatch с манифестом → MCP-компонент невалиден, остальное живёт (§7.2.2).
 */
export function discoverMcpComponents(
  ctx: DiscoverContext,
  options: DiscoverMcpOptions,
): DiscoverMcpResult {
  const isAp = isFile(path.join(ctx.root, 'plugin.json'));
  const fileName = isAp ? 'mcp.json' : '.mcp.json';
  const inline = overrideInlineObject(options.override);
  let raw: unknown;
  let label: string;
  if (inline !== undefined) {
    raw = inline;
    label = `${fileName} (inline)`;
  } else {
    const candidates = [
      ...overrideDirs(ctx.root, options.override).map((dir) => path.join(dir, fileName)),
      path.join(ctx.root, fileName),
    ];
    const filePath = candidates.find((candidate) => isFile(candidate));
    if (filePath === undefined) {
      return emptyResult();
    }
    const content = readFile(filePath, []);
    if (content === undefined) {
      return emptyResult();
    }
    try {
      raw = JSON.parse(content);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        components: [],
        diagnostics: [{ level: 'error', code: 'server_config_invalid', message, path: filePath }],
      };
    }
    label = relativeToRoot(ctx.root, filePath);
  }
  const parseCtx: ExpandPluginVarsContext = {
    pluginRoot: path.resolve(ctx.root),
    pluginData: path.resolve(options.pluginData),
  };
  return isAp ? parseApMcp(ctx, options, raw, label) : parseClaudeMcp(parseCtx, raw, label);
}

function emptyResult(): DiscoverMcpResult {
  return { components: [], diagnostics: [] };
}

function parseApMcp(
  ctx: DiscoverContext,
  options: DiscoverMcpOptions,
  raw: unknown,
  label: string,
): DiscoverMcpResult {
  const parseCtx: ExpandPluginVarsContext = {
    pluginRoot: path.resolve(ctx.root),
    pluginData: path.resolve(options.pluginData),
  };
  if (!isPlainObject(raw)) {
    return {
      ...emptyResult(),
      diagnostics: [entryWarning(label, 'mcp.json must be a JSON object')],
    };
  }
  const fileSchema = typeof raw.$schema === 'string' ? raw.$schema : undefined;
  if (fileSchema !== undefined && fileSchema !== AP_MCP_SCHEMA_ID) {
    // §7.2.2: mismatch версии $schema с манифестом валидирует только MCP-компонент, остальное живёт.
    const expected = options.declaredSchema ?? AP_MCP_SCHEMA_ID;
    return {
      components: [droppedServerComponent(label, '$', raw)],
      diagnostics: [
        {
          level: 'error',
          code: 'server_config_invalid',
          message: `mcp.json $schema "${fileSchema}" does not match manifest schema "${expected}"`,
          path: label,
        },
      ],
    };
  }
  const diagnostics: PluginDiagnostic[] = [];
  for (const error of validateApMcp(raw)) {
    diagnostics.push({
      level: 'error',
      code: 'server_config_invalid',
      message: error,
      path: label,
    });
  }
  const servers = isPlainObject(raw.mcpServers) ? raw.mcpServers : {};
  const components: PluginComponent[] = [];
  for (const [key, value] of Object.entries(servers)) {
    try {
      const spec = parseApServer(key, value, parseCtx);
      components.push(nativeServerComponent(label, key, spec));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push(serverWarning(label, key, message));
      components.push(droppedServerComponent(label, key, value));
    }
  }
  return { components, diagnostics };
}

function parseClaudeMcp(
  parseCtx: ExpandPluginVarsContext,
  raw: unknown,
  label: string,
): DiscoverMcpResult {
  const diagnostics: PluginDiagnostic[] = [];
  const components: PluginComponent[] = [];
  const servers = claudeServersMap(raw);
  if (servers === undefined) {
    return {
      components,
      diagnostics: [
        entryWarning(
          label,
          '.mcp.json must be a "name → config" map or contain an "mcpServers" object',
        ),
      ],
    };
  }
  const base = wrappedServersMap(raw) ? 'mcpServers.' : '';
  for (const [key, value] of Object.entries(servers)) {
    if (!isPlainObject(value)) {
      diagnostics.push(entryWarning(label, `${base}${key} must be an object`));
      components.push(droppedServerComponent(label, key, value));
      continue;
    }
    // Паритет Claude: transport 'socket' принимается и исполняется поверх stdio —
    // для парсера это обычный stdio-сервер с лишним полем transport.
    try {
      const spec = parseClaudeServer(key, value, parseCtx);
      components.push(nativeServerComponent(label, key, spec));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const code = message.startsWith('path escapes plugin root')
        ? 'path_escapes_root'
        : 'server_config_invalid';
      diagnostics.push({
        level: 'warning',
        code,
        message: `${base}${key}: ${message}`,
        path: label,
      });
      components.push(droppedServerComponent(label, key, value));
    }
  }
  return { components, diagnostics };
}

/**
 * Две формы карты серверов: обёртка `{"mcpServers": {…}}` (доки Claude) и голая
 * `{"name": {…}}` (`.mcp.json` официального маркетплейса, напр. playwright).
 * Обёртка приоритетна; inline-оверрайд манифеста — всегда голая карта.
 */
function claudeServersMap(raw: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  if (raw.mcpServers !== undefined) {
    return isPlainObject(raw.mcpServers) ? raw.mcpServers : undefined;
  }
  return raw;
}

function wrappedServersMap(raw: unknown): boolean {
  return isPlainObject(raw) && isPlainObject(raw.mcpServers);
}

function serverWarning(label: string, key: string, message: string): PluginDiagnostic {
  return {
    level: 'warning',
    code: 'server_config_invalid',
    message: `mcpServers.${key}: ${message}`,
    path: label,
  };
}

/** AP §7.2.1: строгие формы — bare/single-token command или `./…`, cwd-формы, зарезервированный env. */
function parseApServer(
  key: string,
  value: unknown,
  parseCtx: ExpandPluginVarsContext,
): McpServerSpec {
  if (!isPlainObject(value)) {
    throw new Error('must be an object');
  }
  const type = value.type;
  if (type === 'stdio') {
    checkUnknownKeys(value, ['type', 'command', 'args', 'env', 'cwd']);
    if (typeof value.command !== 'string' || value.command.length === 0) {
      throw new Error('command must be a non-empty string');
    }
    const config: McpServerConfig = {
      type: 'stdio',
      command: resolveApCommand(parseCtx.pluginRoot, value.command),
      cwd: resolveApCwd(value.cwd, parseCtx),
    };
    if ('args' in value) {
      config.args = parseStringArgs(value.args, parseCtx);
    }
    if ('env' in value) {
      config.env = parseStrictEnv(value.env, parseCtx);
    }
    return { serverId: key, config };
  }
  if (type === 'streamable-http' || type === 'sse') {
    checkUnknownKeys(value, ['type', 'url', 'headers']);
    return { serverId: key, config: parseUrlConfig(value, type) };
  }
  throw new Error(
    typeof type === 'string' ? `unsupported transport "${type}"` : 'missing or invalid type',
  );
}

/** Claude: снисходительные формы; ${CLAUDE_PLUGIN_ROOT}/${CLAUDE_PLUGIN_DATA} расширяются. */
function parseClaudeServer(
  key: string,
  value: Record<string, unknown>,
  parseCtx: ExpandPluginVarsContext,
): McpServerSpec {
  const transport = value.transport ?? value.type;
  if (transport === 'sse' || transport === 'streamable-http' || transport === 'http') {
    const kind = transport === 'sse' ? 'sse' : 'streamable-http';
    return { serverId: key, config: parseUrlConfig(value, kind) };
  }
  if (typeof value.command !== 'string' || value.command.length === 0) {
    throw new Error('command must be a non-empty string');
  }
  const command = expandPluginVars(value.command, parseCtx);
  if (command.startsWith('./')) {
    resolveInsideRoot(parseCtx.pluginRoot, command);
  }
  const config: McpServerConfig = { type: 'stdio', command };
  if (typeof value.cwd === 'string' && value.cwd.length > 0) {
    config.cwd = path.resolve(parseCtx.pluginRoot, expandPluginVars(value.cwd, parseCtx));
  }
  if (Array.isArray(value.args)) {
    config.args = value.args
      .filter((item): item is string => typeof item === 'string')
      .map((item) => expandPluginVars(item, parseCtx));
  }
  if (isPlainObject(value.env)) {
    const env: Record<string, string> = {};
    for (const [envKey, envValue] of Object.entries(value.env)) {
      if (typeof envValue === 'string') {
        env[envKey] = expandPluginVars(envValue, parseCtx);
      }
    }
    config.env = env;
  }
  return { serverId: key, config };
}

function parseUrlConfig(
  value: Record<string, unknown>,
  type: 'streamable-http' | 'sse',
): McpServerConfig {
  if (typeof value.url !== 'string' || value.url.length === 0) {
    throw new Error('url must be a non-empty string');
  }
  const config: McpServerConfig = { type, url: value.url };
  if (isPlainObject(value.headers)) {
    const headers: Record<string, string> = {};
    for (const [key, header] of Object.entries(value.headers)) {
      if (typeof header === 'string') {
        if (header.includes('${user_config.')) {
          // Спека §3: http headers вычисляются вне exec-биндера — reject при парсе.
          throw new Error(`headers.${key}: ${'$'}{user_config.*} is not allowed`);
        }
        headers[key] = header;
      }
    }
    config.headers = headers;
  }
  return config;
}

function checkUnknownKeys(raw: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new Error(`unknown field "${key}"`);
    }
  }
}

function resolveApCommand(pluginRoot: string, command: string): string {
  if (command.startsWith('./')) {
    return resolveInsideRoot(pluginRoot, command);
  }
  if (command.includes('/') || command.includes('\\')) {
    throw new Error(`command must be a bare executable or start with "./": ${command}`);
  }
  return command;
}

function resolveInsideRoot(pluginRoot: string, relativePath: string): string {
  const resolved = path.resolve(pluginRoot, relativePath);
  if (!assertInsideRoot(pluginRoot, resolved)) {
    throw new Error(`path escapes plugin root: ${relativePath}`);
  }
  return resolved;
}

function resolveApCwd(rawCwd: unknown, parseCtx: ExpandPluginVarsContext): string {
  if (rawCwd === undefined) {
    return path.resolve(parseCtx.pluginRoot);
  }
  if (typeof rawCwd !== 'string') {
    throw new Error('cwd must be a string');
  }
  if (!CWD_FORM.test(rawCwd)) {
    throw new Error(CWD_FORM_MESSAGE);
  }
  const isData = rawCwd.startsWith(PLUGIN_DATA_PLACEHOLDER);
  const expanded = expandPluginVars(rawCwd, parseCtx);
  if (rawCwd.startsWith('./')) {
    return resolveInsideRoot(parseCtx.pluginRoot, expanded);
  }
  const resolved = path.resolve(expanded);
  const root = isData ? parseCtx.pluginData : parseCtx.pluginRoot;
  if (!assertInsideRoot(root, resolved)) {
    throw new Error(`cwd escapes plugin ${isData ? 'data' : 'root'}: ${rawCwd}`);
  }
  return resolved;
}

function parseStringArgs(value: unknown, parseCtx: ExpandPluginVarsContext): string[] {
  if (!Array.isArray(value)) {
    throw new Error('args must be an array of strings');
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`args[${index}] must be a string`);
    }
    return expandPluginVars(item, parseCtx);
  });
}

function parseStrictEnv(value: unknown, parseCtx: ExpandPluginVarsContext): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new Error('env must be an object of strings');
  }
  const env: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (RESERVED_ENV_KEYS.has(key)) {
      throw new Error(`env must not contain reserved key "${key}"`);
    }
    if (typeof raw !== 'string') {
      throw new Error(`env.${key} must be a string`);
    }
    env[key] = expandPluginVars(raw, parseCtx);
  }
  return env;
}

function nativeServerComponent(label: string, key: string, spec: McpServerSpec): PluginComponent {
  const component: PluginComponent = {
    kind: 'mcp-server',
    spec,
    source: { file: label, pointer: key },
    status: 'native',
  };
  return component;
}

function droppedServerComponent(label: string, pointer: string, raw: unknown): PluginComponent {
  const component: PluginComponent = {
    kind: 'mcp-server',
    spec: { raw },
    source: { file: label, pointer },
    status: 'dropped',
  };
  return component;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
