import path from 'node:path';
import type { PluginLoadDiagnostic } from '../../domain/plugin.ts';
import type { CursorMcpJson, StdioEntry, UrlEntry } from '../../ports/mcp.ts';
import {
  type ExpandPluginVarsContext,
  expandPluginVars,
  PLUGIN_DATA_PLACEHOLDER,
  PLUGIN_ROOT_PLACEHOLDER,
} from './expand-plugin-vars.ts';
import { assertInsideRoot } from './plugin-conformance.ts';

export const AGENT_PLUGINS_MCP_SCHEMA_ID =
  'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

export type ParsePluginMcpContext = {
  pluginRoot: string;
  pluginData: string;
  pluginName: string;
};

export type ParsePluginMcpResult = {
  fragment: CursorMcpJson;
  diagnostics: PluginLoadDiagnostic[];
};

type PluginMcpServerMap = Record<string, StdioEntry | UrlEntry>;

const RESERVED_ENV_KEYS = new Set(['PLUGIN_ROOT', 'PLUGIN_DATA']);

const STDIO_KEYS = new Set(['type', 'command', 'args', 'env', 'cwd']);
const URL_KEYS = new Set(['type', 'url', 'headers']);

const CWD_FORM = new RegExp(
  `^(?:\\./|${escapeRegExp(PLUGIN_ROOT_PLACEHOLDER)}(?:/|$)|${escapeRegExp(PLUGIN_DATA_PLACEHOLDER)}(?:/|$))`,
);

const CWD_FORM_MESSAGE = `cwd must be "./…", "${PLUGIN_ROOT_PLACEHOLDER}" / "${PLUGIN_ROOT_PLACEHOLDER}/…", or "${PLUGIN_DATA_PLACEHOLDER}" / "${PLUGIN_DATA_PLACEHOLDER}/…"`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fileError(message: string): ParsePluginMcpResult {
  return {
    fragment: { mcpServers: {} },
    diagnostics: [
      {
        level: 'error',
        code: 'invalid_mcp_file',
        message,
      },
    ],
  };
}

function entryWarning(key: string, message: string): PluginLoadDiagnostic {
  return {
    level: 'warning',
    code: 'invalid_mcp_server',
    message: `mcpServers.${key}: ${message}`,
  };
}

function hasUnknownKeys(raw: Record<string, unknown>, allowed: Set<string>): string | undefined {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      return key;
    }
  }
  return undefined;
}

function resolveInsideRoot(pluginRoot: string, relativePath: string): string {
  const resolved = path.resolve(pluginRoot, relativePath);
  if (!assertInsideRoot(pluginRoot, resolved)) {
    throw new Error(`path escapes plugin root: ${relativePath}`);
  }
  return resolved;
}

function resolveStdioCommand(pluginRoot: string, command: string): string {
  if (command.startsWith('./')) {
    return resolveInsideRoot(pluginRoot, command);
  }
  if (command.includes('/') || command.includes('\\')) {
    throw new Error(`command must be a bare executable or start with "./": ${command}`);
  }
  if (command.length === 0) {
    throw new Error('command must be a non-empty string');
  }
  return command;
}

function parseArgs(value: unknown, expandCtx: ExpandPluginVarsContext): string[] {
  if (!Array.isArray(value)) {
    throw new Error('args must be an array of strings');
  }
  const args: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== 'string') {
      throw new Error(`args[${i}] must be a string`);
    }
    args.push(expandPluginVars(item, expandCtx));
  }
  return args;
}

function parseEnv(value: unknown, expandCtx: ExpandPluginVarsContext): Record<string, string> {
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
    env[key] = expandPluginVars(raw, expandCtx);
  }
  return env;
}

type CwdKind = 'pluginRoot' | 'pluginData';

function cwdKindBeforeExpand(cwd: string): CwdKind {
  if (cwd.startsWith('./')) {
    return 'pluginRoot';
  }
  if (cwd === PLUGIN_ROOT_PLACEHOLDER || cwd.startsWith(`${PLUGIN_ROOT_PLACEHOLDER}/`)) {
    return 'pluginRoot';
  }
  if (cwd === PLUGIN_DATA_PLACEHOLDER || cwd.startsWith(`${PLUGIN_DATA_PLACEHOLDER}/`)) {
    return 'pluginData';
  }
  throw new Error(CWD_FORM_MESSAGE);
}

function resolveCwd(
  rawCwd: unknown,
  ctx: ParsePluginMcpContext,
  expandCtx: ExpandPluginVarsContext,
): string {
  if (rawCwd === undefined) {
    return path.resolve(ctx.pluginRoot);
  }
  if (typeof rawCwd !== 'string') {
    throw new Error('cwd must be a string');
  }
  if (!CWD_FORM.test(rawCwd)) {
    throw new Error(CWD_FORM_MESSAGE);
  }
  const kind = cwdKindBeforeExpand(rawCwd);
  const expanded = expandPluginVars(rawCwd, expandCtx);
  if (rawCwd.startsWith('./')) {
    return resolveInsideRoot(ctx.pluginRoot, expanded);
  }
  const resolved = path.resolve(expanded);
  if (kind === 'pluginRoot') {
    if (!assertInsideRoot(ctx.pluginRoot, resolved)) {
      throw new Error(`cwd escapes plugin root: ${rawCwd}`);
    }
    return resolved;
  }
  if (!assertInsideRoot(ctx.pluginData, resolved)) {
    throw new Error(`cwd escapes plugin data: ${rawCwd}`);
  }
  return resolved;
}

function parseStdioEntry(
  raw: Record<string, unknown>,
  ctx: ParsePluginMcpContext,
  expandCtx: ExpandPluginVarsContext,
): StdioEntry {
  const unknown = hasUnknownKeys(raw, STDIO_KEYS);
  if (unknown !== undefined) {
    throw new Error(`unknown field "${unknown}"`);
  }
  if (typeof raw.command !== 'string' || raw.command.length === 0) {
    throw new Error('command must be a non-empty string');
  }
  const command = resolveStdioCommand(ctx.pluginRoot, raw.command);
  const entry: StdioEntry = {
    command,
    cwd: resolveCwd(raw.cwd, ctx, expandCtx),
  };
  if ('args' in raw) {
    entry.args = parseArgs(raw.args, expandCtx);
  }
  if ('env' in raw) {
    entry.env = parseEnv(raw.env, expandCtx);
  }
  return entry;
}

function parseUrlEntry(raw: Record<string, unknown>, mappedType: 'http' | 'sse'): UrlEntry {
  const unknown = hasUnknownKeys(raw, URL_KEYS);
  if (unknown !== undefined) {
    throw new Error(`unknown field "${unknown}"`);
  }
  if (typeof raw.url !== 'string' || raw.url.length === 0) {
    throw new Error('url must be a non-empty string');
  }
  const entry: UrlEntry = { url: raw.url, type: mappedType };
  if ('headers' in raw) {
    if (!isPlainObject(raw.headers)) {
      throw new Error('headers must be an object of strings');
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.headers)) {
      if (typeof value !== 'string') {
        throw new Error(`headers.${key} must be a string`);
      }
      headers[key] = value;
    }
    entry.headers = headers;
  }
  return entry;
}

function parseServerEntry(
  key: string,
  value: unknown,
  ctx: ParsePluginMcpContext,
  expandCtx: ExpandPluginVarsContext,
): { entry: StdioEntry | UrlEntry } | { diagnostic: PluginLoadDiagnostic } {
  if (!isPlainObject(value)) {
    return { diagnostic: entryWarning(key, 'must be an object') };
  }
  const type = value.type;
  try {
    if (type === 'stdio') {
      return { entry: parseStdioEntry(value, ctx, expandCtx) };
    }
    if (type === 'streamable-http') {
      return { entry: parseUrlEntry(value, 'http') };
    }
    if (type === 'sse') {
      return { entry: parseUrlEntry(value, 'sse') };
    }
    return {
      diagnostic: entryWarning(
        key,
        typeof type === 'string' ? `unsupported type "${type}"` : 'missing or invalid type',
      ),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { diagnostic: entryWarning(key, message) };
  }
}

export function parsePluginMcpFile(raw: unknown, ctx: ParsePluginMcpContext): ParsePluginMcpResult {
  if (!isPlainObject(raw)) {
    return fileError('mcp.json must be a JSON object');
  }

  for (const key of Object.keys(raw)) {
    if (key !== '$schema' && key !== 'mcpServers') {
      return fileError(`mcp.json has unknown top-level field "${key}"`);
    }
  }

  if (raw.$schema !== AGENT_PLUGINS_MCP_SCHEMA_ID) {
    return fileError(`mcp.json field "$schema" must be "${AGENT_PLUGINS_MCP_SCHEMA_ID}"`);
  }

  if (!isPlainObject(raw.mcpServers)) {
    return fileError('mcp.json field "mcpServers" must be an object');
  }

  const expandCtx: ExpandPluginVarsContext = {
    pluginRoot: path.resolve(ctx.pluginRoot),
    pluginData: path.resolve(ctx.pluginData),
  };
  const resolvedCtx: ParsePluginMcpContext = {
    pluginRoot: expandCtx.pluginRoot,
    pluginData: expandCtx.pluginData,
    pluginName: ctx.pluginName,
  };

  const mcpServers: PluginMcpServerMap = {};
  const diagnostics: PluginLoadDiagnostic[] = [];

  for (const [key, value] of Object.entries(raw.mcpServers)) {
    const result = parseServerEntry(key, value, resolvedCtx, expandCtx);
    if ('diagnostic' in result) {
      diagnostics.push(result.diagnostic);
      continue;
    }
    mcpServers[`${ctx.pluginName}/${key}`] = result.entry;
  }

  return { fragment: { mcpServers }, diagnostics };
}
